// Victim voices: turns a victim line into speech with ElevenLabs' streaming text-to-speech
// (docs: elevenlabs.io/docs/api-reference/text-to-speech/stream) and hands back the audio
// as it arrives, for the HTTP route to stream to the player. Every line is checked against
// the cost limits first and its characters logged. A line that's over a limit or fails is
// shown as subtitles only; the client times it like a line without a voice.

import { Readable } from "node:stream";
import type { FastifyBaseLogger } from "fastify";
import { ServerConfig } from "@server/config";
import type { Scenario } from "@server/scenarios/scenarioSchema";

type Voice = Scenario["voice"];

/** The parts of the server's logger this uses. */
export type VoiceLog = Pick<FastifyBaseLogger, "info" | "warn">;

export interface VoiceServiceOptions {
  apiKey: string;
  // Counts a line of `characters` against the player's limits. False means it's over one.
  allowLine: (playerId: string, characters: number) => boolean;
  log: VoiceLog;
  // Tests pass fakes for these.
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** A line's audio (MP3, still arriving), or why there isn't any. */
export type VoiceLine = { ok: true; audio: Readable } | { ok: false; reason: "limit" | "failed" };

// One request to ElevenLabs: the audio, or what went wrong and whether trying again may help.
type Attempt = { ok: true; audio: Readable } | { ok: false; retry: boolean; detail: string };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VoiceService {
  private readonly apiKey: string;
  private readonly allowLine: VoiceServiceOptions["allowLine"];
  private readonly log: VoiceLog;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: VoiceServiceOptions) {
    this.apiKey = options.apiKey;
    this.allowLine = options.allowLine;
    this.log = options.log;
    this.fetch = options.fetch ?? fetch;
    this.sleep = options.sleep ?? wait;
  }

  /** Speech for `text` in `voice`. Aborting `signal` (the player went away) stops the
   * request, including audio still on its way. A line that passes the limits counts against
   * them even if ElevenLabs then fails. */
  async speak(
    playerId: string,
    text: string,
    voice: Voice,
    signal: AbortSignal,
  ): Promise<VoiceLine> {
    if (signal.aborted) {
      return { ok: false, reason: "failed" };
    }
    const characters = [...text].length;
    if (!this.allowLine(playerId, characters)) {
      this.log.info({ playerId, characters }, "Voice: over a limit, so the line is subtitles only");
      return { ok: false, reason: "limit" };
    }
    const { MaxRetries, RetryBaseMs } = ServerConfig.ElevenLabs;
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.request(text, voice, signal);
      if (result.ok) {
        this.log.info({ playerId, characters }, "Voice: line spoken");
        return result;
      }
      if (!result.retry || attempt >= MaxRetries || signal.aborted) {
        this.log.warn({ playerId, detail: result.detail }, "Voice: request failed");
        return { ok: false, reason: "failed" };
      }
      await this.sleep(RetryBaseMs * 2 ** attempt);
    }
  }

  private async request(text: string, voice: Voice, signal: AbortSignal): Promise<Attempt> {
    const { BaseUrl, Model, OutputFormat, RequestTimeoutMs } = ServerConfig.ElevenLabs;
    const controller = new AbortController();
    const stop = (): void => controller.abort();
    if (signal.aborted) {
      return { ok: false, retry: false, detail: "cancelled" };
    }
    signal.addEventListener("abort", stop, { once: true });
    // Only until the audio starts arriving; after that it streams as fast as it's made.
    const timer = setTimeout(stop, RequestTimeoutMs);
    try {
      const url = `${BaseUrl}/${encodeURIComponent(voice.voiceId)}/stream?output_format=${OutputFormat}`;
      const response = await this.fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: Model,
          voice_settings: {
            stability: voice.stability,
            similarity_boost: voice.similarityBoost,
            style: voice.style,
            use_speaker_boost: true,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok || response.body === null) {
        const body = await response.text().catch(() => "");
        return {
          ok: false,
          retry: response.status === 429 || response.status >= 500,
          detail: `status ${response.status}: ${body}`,
        };
      }
      return { ok: true, audio: Readable.fromWeb(response.body) };
    } catch (error) {
      // A network error or the timeout.
      return { ok: false, retry: true, detail: String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}
