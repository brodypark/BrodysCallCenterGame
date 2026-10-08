// Gets the victim's next reply from Gemini. Ported from the Roblox AIService.
//
// Every request has a timeout, and every reply is checked and cleaned (aiReply.ts). A failed
// try (timeout, error, safety block, bad JSON) is retried with backoff until
// Config.AI.MaxRetries or the reply deadline; after that, or when a cost guard says no, it
// returns null and CallService uses a scripted line, so the game never waits on the AI.
//
// Each player has at most one request at a time, and a call ending stops its request. Tokens
// are added up per call and logged when it ends.
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
  model: VictimModel;
  // Counts one request for a player, or says no (rate limit or daily cap).
  allowRequest: (playerId: string) => boolean;
  log: AILog;
  // A random number from 0 up to 1, for the obsession roll. Tests pass a predictable one.
  random?: () => number;
}

// What one call used, for the log when it ends.
interface CallUsage {
  scenarioId: string;
  requests: number;
  failures: number;
  scriptedReplies: number;
  hitLimit: boolean;
  tokens: TokenUsage;
}

type Attempt =
  { ok: true; response: ModelResponse } | { ok: false; reason: string; retryable: boolean };

// Client errors that won't fix themselves on a retry (a bad key, a bad request). 408, 409
// and 429 are worth retrying.
const HttpBadRequest = 400;
const HttpServerError = 500;
const RetryableClientStatuses = new Set([408, 409, 429]);

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
    scriptedReplies: 0,
    hitLimit: false,
    tokens: { input: 0, output: 0, cached: 0, thought: 0 },
  };
}

export class AIService implements VictimReplySource {
  private readonly model: VictimModel;
  private readonly allowRequest: (playerId: string) => boolean;
  private readonly log: AILog;
  private readonly random: () => number;
  // Built once per scenario: it never changes, which lets Gemini cache it.
  private readonly systemPrompts = new Map<string, string>();
  // Each player's running request, so a call ending can stop it.
  private readonly inFlight = new Map<string, AbortController>();
  private readonly usage = new Map<string, CallUsage>();

  constructor(options: AIServiceOptions) {
    this.model = options.model;
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

  private systemPromptFor(scenario: Scenario): string {
    let prompt = this.systemPrompts.get(scenario.id);
    if (prompt === undefined) {
      prompt = systemPrompt(scenario);
      this.systemPrompts.set(scenario.id, prompt);
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
    const system = this.systemPromptFor(scenario);
    // Built now, so later changes to the call don't matter.
    const input = turnPrompt(scenario, request.history, { ...request.context, mentionObsession });
    const deadline = Date.now() + secondsToMs(Config.AI.ReplyDeadlineSeconds);

    for (let attempt = 0; attempt <= Config.AI.MaxRetries; attempt++) {
      const remainingMs = deadline - Date.now();
      if (signal.aborted || !request.stillWanted() || remainingMs <= 0) {
        return null;
      }
      if (!this.allowRequest(playerId)) {
        if (!usage.hitLimit) {
          this.log.info(
            { playerId },
            "AI: rate limit or daily cap reached; using scripted replies",
          );
        }
        usage.hitLimit = true;
        return null;
      }
      usage.requests += 1;
      const timeoutMs = Math.min(secondsToMs(Config.AI.RequestTimeoutSeconds), remainingMs);
      const result = await this.requestOnce(system, input, signal, timeoutMs);
      if (signal.aborted) {
        return null;
      }
      let failure: { reason: string; retryable: boolean };
      if (result.ok) {
        const { response } = result;
        usage.tokens.input += response.usage.input;
        usage.tokens.output += response.usage.output;
        usage.tokens.cached += response.usage.cached;
        usage.tokens.thought += response.usage.thought;
        const reply =
          response.status === "completed" && response.text !== null
            ? parseAIReply(response.text, scenario.codePrefix)
            : null;
        if (reply) {
          this.log.debug(
            {
              playerId,
              suspicionChange: reply.suspicionChange,
              revealsCode: reply.revealsCode,
              mentionObsession,
            },
            "AI reply",
          );
          return reply;
        }
        failure = {
          reason:
            response.status === "completed"
              ? "reply didn't match the expected shape"
              : `status ${response.status} (possibly a safety block)`,
          // Bad JSON is worth another try. A safety block or a cut-off reply would very
          // likely happen again on the same input, so that goes straight to a scripted line.
          retryable: response.status === "completed",
        };
      } else {
        failure = { reason: result.reason, retryable: result.retryable };
      }
      usage.failures += 1;
      this.log.warn(
        { playerId, attempt: attempt + 1, attempts: Config.AI.MaxRetries + 1, ...failure },
        "AI: request failed",
      );
      const backoffMs = secondsToMs(Config.AI.RetryBaseSeconds * 2 ** attempt);
      // No point waiting if the deadline would pass before the next try could start.
      if (!failure.retryable || deadline - Date.now() <= backoffMs) {
        return null;
      }
      if (attempt < Config.AI.MaxRetries) {
        await wait(backoffMs, signal);
      }
    }
    return null;
  }

  /** One request, given up on after `timeoutMs` or when `parent` fires. */
  private async requestOnce(
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
        this.model.generate({ systemInstruction, input, signal: controller.signal }),
        rejectOnAbort(controller.signal),
      ]);
      return { ok: true, response };
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, reason: parent.aborted ? "call ended" : "timed out", retryable: true };
      }
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        retryable: isRetryableStatus(error instanceof ModelRequestError ? error.status : undefined),
      };
    } finally {
      clearTimeout(timer);
      parent.removeEventListener("abort", stop);
    }
  }
}
