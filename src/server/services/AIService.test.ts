import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { grandma } from "@server/scenarios/grandma";
import type { Scenario } from "@server/scenarios/scenarioSchema";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { systemPrompt } from "@server/prompts/VictimPrompt";
import { AIService, type AILog, type VictimReplyRequest } from "@server/services/AIService";
import {
  ModelRequestError,
  type ModelRequest,
  type ModelResponse,
} from "@server/services/GeminiClient";

function loadGrandma(): Scenario {
  const loaded = createScenarioRegistry([grandma]).get("grandma");
  if (!loaded) {
    throw new Error("Grandma is missing");
  }
  return loaded;
}
const scenario = loadGrandma();
const PlayerId = "player-1";
const Models = [Config.AI.Model, ...Config.AI.FallbackModels];

function completed(text: string): ModelResponse {
  return { text, status: "completed", usage: { input: 100, output: 20, cached: 0, thought: 5 } };
}
const good = completed(
  JSON.stringify({ reply: "Hello, dear!", suspicionChange: -5, revealsCode: false }),
);
const bad = completed("not json at all");
const blocked: ModelResponse = { ...good, status: "failed", text: null };

type Generate = (request: ModelRequest) => Promise<ModelResponse>;

function setup(
  options: { generate?: Generate; backup?: Generate; allow?: boolean; random?: number } = {},
) {
  const generate = vi.fn<Generate>(options.generate ?? (() => Promise.resolve(good)));
  const backup = vi.fn<Generate>(options.backup ?? (() => Promise.resolve(good)));
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } satisfies AILog;
  const allowRequest = vi.fn(() => options.allow ?? true);
  const service = new AIService({
    models: options.backup ? [{ generate }, { generate: backup }] : [{ generate }],
    allowRequest,
    log,
    random: () => options.random ?? 0.99,
  });
  const request = (overrides: Partial<VictimReplyRequest> = {}): VictimReplyRequest => ({
    playerId: PlayerId,
    scenario,
    history: [{ speaker: "player", text: "Hi, how can I help?" }],
    context: {
      suspicion: 40,
      playerTurns: 1,
      codeRevealed: false,
      sideProblem: null,
      cardRevealed: false,
    },
    stillWanted: () => true,
    ...overrides,
  });
  return { service, generate, backup, log, allowRequest, request };
}

/** The models asked, in order. */
function modelsAsked(generate: ReturnType<typeof vi.fn<Generate>>): string[] {
  return generate.mock.calls.map(([sent]) => sent.model);
}

/** A model call that never answers, but rejects when its signal fires (like the SDK). */
const hang: Generate = ({ signal }) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AIService", () => {
  it("returns the cleaned reply, sending the scenario's prompt and the call", async () => {
    const { service, generate, request } = setup();
    await expect(service.getReply(request())).resolves.toEqual({
      reply: "Hello, dear!",
      suspicionChange: -5,
      revealsCode: false,
      revealsCard: false,
      hangsUp: false,
    });
    const sent = generate.mock.calls[0]?.[0];
    expect(sent?.model).toBe(Config.AI.Model);
    expect(sent?.systemInstruction).toBe(systemPrompt(scenario));
    expect(sent?.input).toContain('Help line: "Hi, how can I help?"');
  });

  it("tells the AI to mention the obsession only when the roll says so", async () => {
    const often = setup({ random: 0 });
    await often.service.getReply(often.request());
    expect(often.generate.mock.calls[0]?.[0].input).toContain("work in a quick mention");

    const rarely = setup({ random: 0.99 });
    await rarely.service.getReply(rarely.request());
    expect(rarely.generate.mock.calls[0]?.[0].input).toContain("Don't bring up your obsession");
  });

  it("moves straight on to the next model after a bad reply", async () => {
    const { service, generate, request } = setup();
    generate.mockResolvedValueOnce(bad);
    await expect(service.getReply(request())).resolves.toMatchObject({ reply: "Hello, dear!" });
    expect(modelsAsked(generate)).toEqual(Models.slice(0, 2));
  });

  it("tries another model after a safety block instead of going scripted", async () => {
    const { service, generate, request } = setup();
    generate.mockResolvedValueOnce(blocked);
    await expect(service.getReply(request())).resolves.not.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models.slice(0, 2));
  });

  it("tries another model after a rate-limited or server error", async () => {
    const { service, generate, request } = setup();
    generate.mockRejectedValueOnce(new ModelRequestError("Too many requests", 429));
    generate.mockRejectedValueOnce(new ModelRequestError("Overloaded", 503));
    await expect(service.getReply(request())).resolves.not.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models.slice(0, 3));
  });

  it("starts a backup request alongside a slow one, and the first good reply wins", async () => {
    const { service, generate, log, request } = setup();
    generate.mockImplementationOnce(hang);
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.HedgeAfterSeconds));
    await expect(reply).resolves.toMatchObject({ reply: "Hello, dear!" });
    expect(modelsAsked(generate)).toEqual(Models.slice(0, 2));
    // The slow one is stopped.
    expect(generate.mock.calls[0]?.[0].signal.aborted).toBe(true);
    service.callEnded(PlayerId);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ hedges: 1, backupReplies: 1, scriptedReplies: 0 }),
      "AI usage for call",
    );
  });

  it("keeps the slow request's reply if it beats the backup", async () => {
    const { service, generate, request } = setup();
    const slowMs = secondsToMs(Config.AI.HedgeAfterSeconds) + 500;
    generate.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(good), slowMs)),
    );
    generate.mockImplementationOnce(hang);
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(slowMs);
    await expect(reply).resolves.not.toBeNull();
    expect(generate.mock.calls[1]?.[0].signal.aborted).toBe(true);
  });

  it("uses the backup key once the main key is refused", async () => {
    const { service, generate, backup, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("API key not valid", 400)),
      backup: () => Promise.resolve(good),
    });
    await expect(service.getReply(request())).resolves.not.toBeNull();
    // Every model on the main key is skipped after the first refusal.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(modelsAsked(backup)).toEqual([Config.AI.Model]);
  });

  it("tries the backup key's models after the main key's", async () => {
    const { service, generate, backup, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("Overloaded", 503)),
      backup: () => Promise.resolve(good),
    });
    await expect(service.getReply(request())).resolves.not.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models);
    expect(backup).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask the backup key for a model that blocked the reply", async () => {
    const { service, generate, backup, request } = setup({
      generate: () => Promise.resolve(blocked),
      backup: () => Promise.resolve(blocked),
    });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models);
    expect(backup).not.toHaveBeenCalled();
  });

  it("skips only the model, not the key, on a 403 that isn't about the key", async () => {
    const { service, generate, request } = setup();
    generate.mockRejectedValueOnce(new ModelRequestError("Model not allowed", 403));
    await expect(service.getReply(request())).resolves.not.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models.slice(0, 2));
  });

  it("calls the rate limiter once per request, hedges included", async () => {
    const { service, generate, allowRequest, request } = setup();
    generate.mockImplementationOnce(hang);
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.HedgeAfterSeconds));
    await reply;
    expect(allowRequest).toHaveBeenCalledTimes(generate.mock.calls.length);
  });

  it("never runs more than MaxParallelRequests at once", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.RequestTimeoutSeconds) - 1);
    expect(generate).toHaveBeenCalledTimes(Config.AI.MaxParallelRequests);
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
  });

  it("doesn't start a request with too little time left to answer", async () => {
    const startedAt: number[] = [];
    const { service, request } = setup({
      generate: (sent) => {
        startedAt.push(Date.now());
        return hang(sent);
      },
    });
    const begin = Date.now();
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
    const latestStart = secondsToMs(Config.AI.ReplyDeadlineSeconds - Config.AI.MinRequestSeconds);
    for (const time of startedAt) {
      expect(time - begin).toBeLessThanOrEqual(latestStart);
    }
  });

  it("uses the backup key once the main key is refused", async () => {
    const { service, generate, backup, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("API key not valid", 400)),
      backup: () => Promise.resolve(good),
    });
    await expect(service.getReply(request())).resolves.not.toBeNull();
    // Every model on the main key is skipped after the first refusal.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(modelsAsked(backup)).toEqual([Config.AI.Model]);
  });

  it("tries the backup key's models after the main key's", async () => {
    const { service, generate, backup, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("Overloaded", 503)),
      backup: () => Promise.resolve(good),
    });
    await expect(service.getReply(request())).resolves.not.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models);
    expect(backup).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask the backup key for a model that blocked the reply", async () => {
    const { service, generate, backup, request } = setup({
      generate: () => Promise.resolve(blocked),
      backup: () => Promise.resolve(blocked),
    });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models);
    expect(backup).not.toHaveBeenCalled();
  });

  it("skips only the model, not the key, on a 403 that isn't about the key", async () => {
    const { service, generate, request } = setup();
    generate.mockRejectedValueOnce(new ModelRequestError("Model not allowed", 403));
    await expect(service.getReply(request())).resolves.not.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models.slice(0, 2));
  });

  it("calls the rate limiter once per request, hedges included", async () => {
    const { service, generate, allowRequest, request } = setup();
    generate.mockImplementationOnce(hang);
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.HedgeAfterSeconds));
    await reply;
    expect(allowRequest).toHaveBeenCalledTimes(generate.mock.calls.length);
  });

  it("never runs more than MaxParallelRequests at once", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.RequestTimeoutSeconds) - 1);
    expect(generate).toHaveBeenCalledTimes(Config.AI.MaxParallelRequests);
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
  });

  it("doesn't start a request with too little time left to answer", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
    const latestStart = secondsToMs(Config.AI.ReplyDeadlineSeconds - Config.AI.MinRequestSeconds);
    for (const [sent] of generate.mock.calls) {
      expect(sent.signal.aborted).toBe(true);
    }
    expect(Date.now()).toBeGreaterThanOrEqual(latestStart);
  });

  it("gives up on a refused key with no backup", async () => {
    const { service, generate, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("Unauthenticated", 401)),
    });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("skips a model with an error that won't fix itself, but tries the others", async () => {
    const { service, generate, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("Bad request", 400)),
    });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(modelsAsked(generate)).toEqual(Models);
  });

  it("goes round the models again, with backoff, up to MaxAttempts", async () => {
    const { service, generate, request } = setup({ generate: () => Promise.resolve(bad) });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(Config.AI.MaxAttempts);
    expect(modelsAsked(generate).slice(0, Models.length * 2)).toEqual([...Models, ...Models]);
  });

  it("times out requests that never answer, and never waits past the deadline", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
    for (const [sent] of generate.mock.calls) {
      expect(sent.signal.aborted).toBe(true);
    }
  });

  it("doesn't call the AI when the rate limit says no", async () => {
    const { service, generate, request } = setup({ allow: false });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("stops the request when the call ends", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(0);
    service.callEnded(PlayerId);
    await expect(reply).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });

  it("doesn't try again once the reply is no longer wanted", async () => {
    const { service, generate, request } = setup({ generate: hang });
    let wanted = true;
    const reply = service.getReply(request({ stillWanted: () => wanted }));
    await vi.advanceTimersByTimeAsync(0);
    wanted = false;
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.RequestTimeoutSeconds));
    await expect(reply).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps one reply in flight per player", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const first = service.getReply(request());
    await expect(service.getReply(request())).resolves.toBeNull();
    // Another player isn't held up.
    void service.getReply(request({ playerId: "player-2" }));
    expect(generate).toHaveBeenCalledTimes(2);
    service.removePlayer(PlayerId);
    service.removePlayer("player-2");
    await expect(first).resolves.toBeNull();
  });

  it("logs the tokens a call used when it ends, never the prompt", async () => {
    const { service, log, request } = setup();
    await service.getReply(request());
    await service.getReply(request());
    service.callEnded(PlayerId);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: PlayerId,
        scenarioId: "grandma",
        requests: 2,
        tokens: { input: 200, output: 40, cached: 0, thought: 10 },
      }),
      "AI usage for call",
    );
    // A call with no requests logs nothing.
    log.info.mockClear();
    service.callEnded(PlayerId);
    expect(log.info).not.toHaveBeenCalled();
  });
});
