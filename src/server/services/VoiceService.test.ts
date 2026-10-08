import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ServerConfig } from "@server/config";
import { grandma } from "@server/scenarios/grandma";
import { VoiceService } from "@server/services/VoiceService";

const PlayerId = "player-1";
const Line = "Oh, hello dear!";

function audioResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}

function errorResponse(status: number): Response {
  return new Response("nope", { status });
}

/** A VoiceService whose ElevenLabs answers with `responses` in turn (an Error is thrown). */
function setup(responses: (Response | Error)[], allowed = true) {
  const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (next === undefined || next instanceof Error) {
      return Promise.reject(next ?? new Error("No more responses."));
    }
    return Promise.resolve(next);
  });
  const allowLine = vi.fn((_playerId: string, _characters: number) => allowed);
  const sleep = vi.fn(() => Promise.resolve());
  const log = { info: vi.fn(), warn: vi.fn() };
  const service = new VoiceService({ apiKey: "test-key", allowLine, log, fetch, sleep });
  const speak = () => service.speak(PlayerId, Line, grandma.voice, new AbortController().signal);
  return { service, fetch, allowLine, sleep, log, speak };
}

async function bytesOf(audio: Readable): Promise<number[]> {
  const chunks: number[] = [];
  for await (const chunk of audio) {
    chunks.push(...(chunk as Uint8Array));
  }
  return chunks;
}

describe("VoiceService", () => {
  it("streams the line's audio from ElevenLabs in the scenario's voice", async () => {
    const { fetch, allowLine, speak } = setup([audioResponse()]);
    const result = await speak();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(await bytesOf(result.audio)).toEqual([1, 2, 3]);
    }
    expect(allowLine).toHaveBeenCalledWith(PlayerId, [...Line].length);
    const [url, init] = fetch.mock.calls[0] ?? [];
    // VoiceService always passes the URL as a string and the body as JSON text.
    expect(url).toContain(`/${grandma.voice.voiceId}/stream`);
    expect(url).toContain(`output_format=${ServerConfig.ElevenLabs.OutputFormat}`);
    expect(init?.headers).toMatchObject({ "xi-api-key": "test-key" });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      text: Line,
      model_id: ServerConfig.ElevenLabs.Model,
      voice_settings: { stability: grandma.voice.stability },
    });
  });

  it("doesn't call ElevenLabs for a line over a limit", async () => {
    const { fetch, speak } = setup([audioResponse()], false);
    expect(await speak()).toEqual({ ok: false, reason: "limit" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tries again after a server error or network failure, with a pause", async () => {
    const { fetch, sleep, speak } = setup([errorResponse(503), audioResponse()]);
    expect((await speak()).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(ServerConfig.ElevenLabs.RetryBaseMs);
  });

  it("gives up after its retries", async () => {
    const failures = Array.from(
      { length: ServerConfig.ElevenLabs.MaxRetries + 1 },
      () => new Error("network down"),
    );
    const { fetch, log, speak } = setup([...failures, audioResponse()]);
    expect(await speak()).toEqual({ ok: false, reason: "failed" });
    expect(fetch).toHaveBeenCalledTimes(ServerConfig.ElevenLabs.MaxRetries + 1);
    expect(log.warn).toHaveBeenCalled();
  });

  it("doesn't retry a request ElevenLabs turned down", async () => {
    const { fetch, speak } = setup([errorResponse(400), audioResponse()]);
    expect(await speak()).toEqual({ ok: false, reason: "failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries when ElevenLabs is busy (429)", async () => {
    const { fetch, speak } = setup([errorResponse(429), audioResponse()]);
    expect((await speak()).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops without retrying when the player goes mid-request", async () => {
    const { service, fetch, allowLine } = setup([]);
    const gone = new AbortController();
    fetch.mockImplementationOnce((_url, init) => {
      gone.abort();
      return Promise.reject(new Error(`aborted: ${String(init?.signal?.aborted)}`));
    });
    const result = await service.speak(PlayerId, Line, grandma.voice, gone.signal);
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(allowLine).toHaveBeenCalledTimes(1);
  });

  it("doesn't start, or count against the limits, once the player has gone", async () => {
    const { service, fetch, allowLine } = setup([audioResponse()]);
    const gone = new AbortController();
    gone.abort();
    const result = await service.speak(PlayerId, Line, grandma.voice, gone.signal);
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(fetch).not.toHaveBeenCalled();
    expect(allowLine).not.toHaveBeenCalled();
  });
});
