// Gets the victim's next reply from Gemini. Ported from the Roblox AIService.
//
// Every request has a timeout, and every reply is checked and cleaned (aiReply.ts). There
// are several routes to a reply: Config.AI.Model, then each of Config.AI.FallbackModels, on
// the main API key, then the same on the backup key if there is one. A failed try (timeout,
// error, safety block, bad JSON) moves on to the next route; a slow one gets the next route
// started alongside it (a hedge) and the first good reply wins. That goes on until
// Config.AI.MaxAttempts or the reply deadline; after that, or when a cost guard says no, it
// returns null and CallService uses a scripted line, so the game never waits on the AI.
//
// Each player has at most one reply being fetched at a time, and a call ending stops its
// requests. Tokens are added up per call and logged when it ends.
//
// The AI only suggests: CallService still clamps suspicion, decides every reveal and makes
// the code, which the AI never sees.

import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import type { AIReply, Scenario } from "@server/scenarios/scenarioSchema";
import {
  type CallContext,
  type HistoryLine,
  systemPrompt,
  turnPrompt,
} from "@server/prompts/VictimPrompt";
import { parseAIReply } from "@server/services/aiReply";
import {
  ModelRequestError,
  type ModelResponse,
  type TokenUsage,
  type VictimModel,
} from "@server/services/GeminiClient";

export interface VictimReplyRequest {
  playerId: string;
  scenario: Scenario;
  // The call so far, oldest first, ending with the line being answered. No codes in it.
  history: readonly HistoryLine[];
  // Everything but the obsession roll, which is made here.
  context: Omit<CallContext, "mentionObsession">;
  // A bait caller (an undercover scam-buster), who gets their secret in the system prompt.
  bait?: boolean;
  // False once the reply is no longer wanted (the call moved on); no new try starts then.
  stillWanted: () => boolean;
}

/** Where CallService gets victim replies from when the AI is on. */
export interface VictimReplySource {
  /** The victim's next reply, or null to use a scripted one. Never rejects. */
  getReply: (request: VictimReplyRequest) => Promise<AIReply | null>;
  /** The player's call ended: stops its request and logs what it used. */
  callEnded: (playerId: string) => void;
  /** The player is gone: the same, and forgets them. */
  removePlayer: (playerId: string) => void;
}

/** The parts of the server's logger AIService uses. */
export interface AILog {
  debug: (details: object, message: string) => void;
  info: (details: object, message: string) => void;
  warn: (details: object, message: string) => void;
}

export interface AIServiceOptions {
  // One per API key, main key first. Must not be empty.
  models: readonly VictimModel[];
  // Counts one request for a player, or says no (rate limit or daily cap).
  allowRequest: (playerId: string) => boolean;
  log: AILog;
  // A random number from 0 up to 1, for the obsession roll. Tests pass a predictable one.
  random?: () => number;
}

// One way to get a reply: a model id on one API key.
interface Route {
  client: VictimModel;
  // 0 for the main key, 1 for the backup. Logged instead of the key itself.
  key: number;
  model: string;
}

// What one call used, for the log when it ends.
interface CallUsage {
  scenarioId: string;
  requests: number;
  failures: number;
  // Replies that came from a backup model or key, and slow requests that got a hedge.
  backupReplies: number;
  hedges: number;
  scriptedReplies: number;
  hitLimit: boolean;
  tokens: TokenUsage;
}

interface Failure {
  reason: string;
  // Worth trying this same route again (a timeout, an overload, bad JSON).
  retryable: boolean;
  // The API key itself was refused, so no route on that key will work.
  badKey: boolean;
}

type Attempt = { ok: true; response: ModelResponse } | ({ ok: false } & Failure);

// A request that has come back, with the route it went to.
interface Finished {
  id: number;
  routeIndex: number;
  attempt: Attempt;
}

// Client errors that won't fix themselves on a retry (a bad key, a bad request). 408, 409
// and 429 are worth retrying.
const HttpBadRequest = 400;
const HttpServerError = 500;
const RetryableClientStatuses = new Set([408, 409, 429]);
// The key is missing or invalid.
const HttpUnauthorized = 401;
// Gemini answers an invalid key with a 400 (or a refused one with a 403) whose message says
// so. A 403 without it may only mean this model isn't allowed, so only that model is skipped.
const BadKeyStatuses = new Set([400, 403]);
const BadKeyMessage = /api key/i;

function isRetryableStatus(status: number | undefined): boolean {
  return (
    status === undefined ||
    status < HttpBadRequest ||
    status >= HttpServerError ||
    RetryableClientStatuses.has(status)
  );
}

/** Waits `ms`, or less if `signal` fires first. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** A promise that rejects when `signal` fires, so a model that ignores its signal still
 * can't keep us waiting. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

function emptyUsage(scenarioId: string): CallUsage {
  return {
    scenarioId,
    requests: 0,
    failures: 0,
    backupReplies: 0,
    hedges: 0,
    scriptedReplies: 0,
    hitLimit: false,
    tokens: { input: 0, output: 0, cached: 0, thought: 0 },
  };
}

/** Every route, in the order they're tried: each model on the main key, then on the backup. */
function buildRoutes(models: readonly VictimModel[]): Route[] {
  const modelIds = [Config.AI.Model, ...Config.AI.FallbackModels];
  return models.flatMap((client, key) => modelIds.map((model) => ({ client, key, model })));
}

export class AIService implements VictimReplySource {
  private readonly routes: readonly Route[];
  private readonly allowRequest: (playerId: string) => boolean;
  private readonly log: AILog;
  private readonly random: () => number;
  // Built once per scenario (and once more for it as bait): it never changes, which lets
  // Gemini cache it.
  private readonly systemPrompts = new Map<string, string>();
  // Each player's reply being fetched, so a call ending can stop its requests.
  private readonly inFlight = new Map<string, AbortController>();
  private readonly usage = new Map<string, CallUsage>();

  constructor(options: AIServiceOptions) {
    if (options.models.length === 0) {
      throw new Error("AIService needs at least one model.");
    }
    this.routes = buildRoutes(options.models);
    this.allowRequest = options.allowRequest;
    this.log = options.log;
    this.random = options.random ?? Math.random;
  }

  async getReply(request: VictimReplyRequest): Promise<AIReply | null> {
    const { playerId, scenario } = request;
    const usage = this.usage.get(playerId) ?? emptyUsage(scenario.id);
    this.usage.set(playerId, usage);
    if (this.inFlight.has(playerId)) {
      // Can't normally happen: CallService waits for each reply before the next turn.
      this.log.warn({ playerId }, "AI: previous request still running; using a scripted reply");
      usage.scriptedReplies += 1;
      return null;
    }
    const controller = new AbortController();
    this.inFlight.set(playerId, controller);
    try {
      const reply = await this.tryForReply(request, usage, controller.signal);
      if (reply === null) {
        usage.scriptedReplies += 1;
      }
      return reply;
    } catch (error) {
      this.log.warn({ playerId, err: error }, "AI: unexpected error; using a scripted reply");
      usage.scriptedReplies += 1;
      return null;
    } finally {
      // Stops any request still running (the loser of a hedge).
      controller.abort();
      if (this.inFlight.get(playerId) === controller) {
        this.inFlight.delete(playerId);
      }
    }
  }

  callEnded(playerId: string): void {
    this.inFlight.get(playerId)?.abort();
    this.inFlight.delete(playerId);
    const usage = this.usage.get(playerId);
    this.usage.delete(playerId);
    if (usage && usage.requests > 0) {
      this.log.info({ playerId, ...usage }, "AI usage for call");
    }
  }

  removePlayer(playerId: string): void {
    this.callEnded(playerId);
  }

  private systemPromptFor(scenario: Scenario, bait: boolean): string {
    const key = bait ? `${scenario.id}:bait` : scenario.id;
    let prompt = this.systemPrompts.get(key);
    if (prompt === undefined) {
      prompt = systemPrompt(scenario, bait);
      this.systemPrompts.set(key, prompt);
    }
    return prompt;
  }

  private async tryForReply(
    request: VictimReplyRequest,
    usage: CallUsage,
    signal: AbortSignal,
  ): Promise<AIReply | null> {
    const { playerId, scenario } = request;
    const mentionObsession = this.random() < Config.AI.ObsessionChance;
    const system = this.systemPromptFor(scenario, request.bait === true);
    // Built now, so later changes to the call don't matter.
    const input = turnPrompt(scenario, request.history, { ...request.context, mentionObsession });
    const deadline = Date.now() + secondsToMs(Config.AI.ReplyDeadlineSeconds);

    // Routes that won't work for this reply, ones with a request running, and how many
    // times each has been tried.
    const dead = new Set<number>();
    const busy = new Set<number>();
    const tries = this.routes.map(() => 0);
    const pending = new Map<number, Promise<Finished>>();
    let attempts = 0;
    let lastStartAt = 0;
    let hedgingOff = false;

    // The least-tried route that might still work and isn't running, earliest first.
    const nextRoute = (): number | undefined => {
      let best: number | undefined;
      for (let index = 0; index < this.routes.length; index++) {
        if (dead.has(index) || busy.has(index)) {
          continue;
        }
        if (best === undefined || (tries[index] ?? 0) < (tries[best] ?? 0)) {
          best = index;
        }
      }
      return best;
    };

    // Starts a request on the next route. False if none may start.
    const start = (): boolean => {
      const remainingMs = deadline - Date.now();
      const routeIndex = nextRoute();
      if (
        signal.aborted ||
        !request.stillWanted() ||
        remainingMs < secondsToMs(Config.AI.MinRequestSeconds) ||
        attempts >= Config.AI.MaxAttempts ||
        routeIndex === undefined
      ) {
        return false;
      }
      if (!this.allowRequest(playerId)) {
        if (!usage.hitLimit) {
          this.log.info(
            { playerId },
            "AI: rate limit or daily cap reached; using scripted replies",
          );
        }
        usage.hitLimit = true;
        return false;
      }
      const route = this.routes[routeIndex];
      if (!route) {
        return false;
      }
      const id = attempts;
      attempts += 1;
      usage.requests += 1;
      tries[routeIndex] = (tries[routeIndex] ?? 0) + 1;
      busy.add(routeIndex);
      lastStartAt = Date.now();
      const timeoutMs = Math.min(secondsToMs(Config.AI.RequestTimeoutSeconds), remainingMs);
      pending.set(
        id,
        this.requestOnce(route, system, input, signal, timeoutMs).then((attempt) => ({
          id,
          routeIndex,
          attempt,
        })),
      );
      return true;
    };

    for (;;) {
      if (signal.aborted || !request.stillWanted()) {
        return null;
      }
      if (pending.size === 0) {
        // Going back to a route already tried: give it a moment first.
        const routeIndex = nextRoute();
        const triedBefore = routeIndex === undefined ? 0 : (tries[routeIndex] ?? 0);
        if (triedBefore > 0) {
          const backoffMs = secondsToMs(Config.AI.RetryBaseSeconds * 2 ** (triedBefore - 1));
          // No point waiting if the next try couldn't start in time afterwards.
          if (deadline - Date.now() - backoffMs < secondsToMs(Config.AI.MinRequestSeconds)) {
            return null;
          }
          await wait(backoffMs, signal);
        }
        if (!start()) {
          return null;
        }
      }

      const finished = await this.nextFinished(
        pending,
        signal,
        hedgingOff || pending.size >= Config.AI.MaxParallelRequests
          ? undefined
          : lastStartAt + secondsToMs(Config.AI.HedgeAfterSeconds) - Date.now(),
      );
      if (signal.aborted) {
        return null;
      }
      if (finished === "hedge") {
        if (start()) {
          usage.hedges += 1;
          this.log.debug({ playerId }, "AI: slow reply; starting a backup request alongside");
        } else {
          hedgingOff = true;
        }
        continue;
      }

      pending.delete(finished.id);
      busy.delete(finished.routeIndex);
      const route = this.routes[finished.routeIndex];
      const outcome = this.readAttempt(finished.attempt, scenario, usage);
      if ("reply" in outcome) {
        if (finished.routeIndex > 0) {
          usage.backupReplies += 1;
        }
        this.log.debug(
          {
            playerId,
            model: route?.model,
            key: route?.key,
            suspicionChange: outcome.reply.suspicionChange,
            revealsCode: outcome.reply.revealsCode,
            mentionObsession,
          },
          "AI reply",
        );
        return outcome.reply;
      }

      const failure = outcome.failure;
      usage.failures += 1;
      this.log.warn(
        {
          playerId,
          attempt: finished.id + 1,
          maxAttempts: Config.AI.MaxAttempts,
          model: route?.model,
          key: route?.key,
          reason: failure.reason,
        },
        "AI: request failed",
      );
      if (failure.badKey && route) {
        this.routes.forEach((other, index) => {
          if (other.key === route.key) {
            dead.add(index);
          }
        });
      } else if (!failure.retryable && route) {
        // A safety block or a bad request is about the model and input, not the key.
        this.routes.forEach((other, index) => {
          if (other.model === route.model) {
            dead.add(index);
          }
        });
      }
    }
  }

  /** Waits for the first pending request to come back, or "hedge" after `hedgeInMs` (if
   * given) when a backup request should start alongside. */
  private async nextFinished(
    pending: ReadonlyMap<number, Promise<Finished>>,
    signal: AbortSignal,
    hedgeInMs: number | undefined,
  ): Promise<Finished | "hedge"> {
    if (hedgeInMs === undefined) {
      return Promise.race(pending.values());
    }
    const stopTimer = new AbortController();
    const stop = (): void => stopTimer.abort();
    signal.addEventListener("abort", stop, { once: true });
    try {
      return await Promise.race([
        ...pending.values(),
        wait(Math.max(0, hedgeInMs), stopTimer.signal).then(() => "hedge" as const),
      ]);
    } finally {
      stopTimer.abort();
      signal.removeEventListener("abort", stop);
    }
  }

  /** Counts a request's tokens and turns it into a clean reply or a failure. */
  private readAttempt(
    attempt: Attempt,
    scenario: Scenario,
    usage: CallUsage,
  ): { reply: AIReply } | { failure: Failure } {
    if (!attempt.ok) {
      return { failure: attempt };
    }
    const { response } = attempt;
    usage.tokens.input += response.usage.input;
    usage.tokens.output += response.usage.output;
    usage.tokens.cached += response.usage.cached;
    usage.tokens.thought += response.usage.thought;
    const reply =
      response.status === "completed" && response.text !== null
        ? parseAIReply(response.text, scenario.codePrefix)
        : null;
    if (reply) {
      return { reply };
    }
    return {
      failure: {
        reason:
          response.status === "completed"
            ? "reply didn't match the expected shape"
            : `status ${response.status} (possibly a safety block)`,
        // Bad JSON is worth another try. A safety block or a cut-off reply would very
        // likely happen again on the same input and model, so that model is skipped.
        retryable: response.status === "completed",
        badKey: false,
      },
    };
  }

  /** One request, given up on after `timeoutMs` or when `parent` fires. */
  private async requestOnce(
    route: Route,
    systemInstruction: string,
    input: string,
    parent: AbortSignal,
    timeoutMs: number,
  ): Promise<Attempt> {
    const controller = new AbortController();
    const stop = (): void => controller.abort();
    parent.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, timeoutMs);
    try {
      const response = await Promise.race([
        route.client.generate({
          model: route.model,
          systemInstruction,
          input,
          signal: controller.signal,
        }),
        rejectOnAbort(controller.signal),
      ]);
      return { ok: true, response };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          ok: false,
          reason: parent.aborted ? "stopped" : "timed out",
          retryable: true,
          badKey: false,
        };
      }
      const status = error instanceof ModelRequestError ? error.status : undefined;
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason,
        retryable: isRetryableStatus(status),
        badKey:
          status === HttpUnauthorized ||
          (status !== undefined && BadKeyStatuses.has(status) && BadKeyMessage.test(reason)),
      };
    } finally {
      clearTimeout(timer);
      parent.removeEventListener("abort", stop);
    }
  }
}
