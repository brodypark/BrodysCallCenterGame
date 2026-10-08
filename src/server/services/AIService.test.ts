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
const Attempts = Config.AI.MaxRetries + 1;

function completed(text: string): ModelResponse {
  return { text, status: "completed", usage: { input: 100, output: 20, cached: 0, thought: 5 } };
}
const good = completed(
  JSON.stringify({ reply: "Hello, dear!", suspicionChange: -5, revealsCode: false }),
);
const bad = completed("not json at all");

type Generate = (request: ModelRequest) => Promise<ModelResponse>;

function setup(options: { generate?: Generate; allow?: boolean; random?: number } = {}) {
  const generate = vi.fn<Generate>(options.generate ?? (() => Promise.resolve(good)));
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } satisfies AILog;
  const allowRequest = vi.fn(() => options.allow ?? true);
  const service = new AIService({
    model: { generate },
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
  return { service, generate, log, allowRequest, request };
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
    });
    const sent = generate.mock.calls[0]?.[0];
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

  it("retries a bad reply, with backoff, and uses the next good one", async () => {
    const { service, generate, request } = setup();
    generate.mockResolvedValueOnce(bad);
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.RetryBaseSeconds));
    await expect(reply).resolves.toMatchObject({ reply: "Hello, dear!" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a reply that didn't complete (e.g. a safety block)", async () => {
    const { service, generate, request } = setup();
    generate.mockResolvedValueOnce({ ...good, status: "failed", text: null });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("gives up after MaxRetries and returns null for a scripted line", async () => {
    const { service, generate, request } = setup({ generate: () => Promise.resolve(bad) });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(Attempts);
  });

  it("times out a request that never answers, and never waits past the deadline", async () => {
    const { service, generate, request } = setup({ generate: hang });
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.ReplyDeadlineSeconds));
    await expect(reply).resolves.toBeNull();
    expect(generate.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });

  it("doesn't retry an error that won't fix itself, like a bad key", async () => {
    const { service, generate, request } = setup({
      generate: () => Promise.reject(new ModelRequestError("API key not valid", 400)),
    });
    await expect(service.getReply(request())).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited or server error", async () => {
    const { service, generate, request } = setup();
    generate.mockRejectedValueOnce(new ModelRequestError("Too many requests", 429));
    const reply = service.getReply(request());
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.RetryBaseSeconds));
    await expect(reply).resolves.not.toBeNull();
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

  it("doesn't retry once the reply is no longer wanted", async () => {
    const { service, generate, request } = setup({ generate: () => Promise.resolve(bad) });
    let wanted = true;
    const reply = service.getReply(request({ stillWanted: () => wanted }));
    await vi.advanceTimersByTimeAsync(0);
    wanted = false;
    await vi.advanceTimersByTimeAsync(secondsToMs(Config.AI.RetryBaseSeconds));
    await expect(reply).resolves.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps one request in flight per player", async () => {
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
