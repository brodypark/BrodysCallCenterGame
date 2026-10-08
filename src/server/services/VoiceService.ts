import { Config } from "@shared/Config";
import type { Scenario } from "@server/scenarios/scenarioSchema";
import type { FastifyReply } from "fastify";
import { Readable } from "node:stream";

interface PlayerUsage {
  charactersUsed: number;
  resetAt: number;
}

export class VoiceService {
  private readonly usageByPlayer = new Map<string, PlayerUsage>();
  private globalUsage = 0;
  private globalResetAt = 0;

  private getUsage(playerId: string): PlayerUsage {
    const now = Date.now();
    let usage = this.usageByPlayer.get(playerId);
    if (!usage || usage.resetAt < now) {
      usage = { charactersUsed: 0, resetAt: now + 24 * 60 * 60 * 1000 };
      this.usageByPlayer.set(playerId, usage);
    }
    return usage;
  }

  private checkUsage(now: number) {
    if (this.globalResetAt < now) {
      this.globalUsage = 0;
      this.globalResetAt = now + 24 * 60 * 60 * 1000;
      this.usageByPlayer.clear();
    }
  }

  /**
   * Generates TTS via ElevenLabs and streams it directly to the response.
   */
  async streamVictimLine(playerId: string, text: string, scenario: Scenario, reply: FastifyReply): Promise<void> {
    const now = Date.now();
    this.checkUsage(now);

    const charCount = text.length;

    // Check limits and master switch
    if (Config.Voice.TypedOnly || !process.env.ELEVENLABS_API_KEY) {
      reply.status(403).send({ error: "Voice disabled" });
      return;
    }

    const usage = this.getUsage(playerId);
    if (Config.Voice.PerPlayerDailyCharacterCap > 0 && usage.charactersUsed + charCount > Config.Voice.PerPlayerDailyCharacterCap) {
      reply.status(429).send({ error: "Per-player daily voice cap exceeded" });
      return;
    }
    if (Config.Voice.DailyCharacterCap > 0 && this.globalUsage + charCount > Config.Voice.DailyCharacterCap) {
      reply.status(429).send({ error: "Global daily voice cap exceeded" });
      return;
    }

    const voice = scenario.voice;
    const voiceId = voice.voiceId;
    // We use optimize_streaming_latency=2 for real-time responsiveness.
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=2`;

    const requestBody = {
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: voice.stability,
        similarity_boost: voice.similarityBoost,
        style: voice.style,
        use_speaker_boost: true,
      }
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => "Could not read error text");
        console.error(`ElevenLabs API failed with status ${response.status}: ${errText}`);
        reply.status(response.status).send({ error: "ElevenLabs API failed" });
        return;
      }

      // Add to usage
      usage.charactersUsed += charCount;
      this.globalUsage += charCount;

      reply.header("Content-Type", "audio/mpeg");
      // Fastify reply can stream Node.js Streams via `reply.send()` directly.
      return reply.send(Readable.fromWeb(response.body as any));
    } catch (error) {
      console.error("Voice streaming failed:", error);
      reply.status(500).send({ error: "Internal error" });
    }
  }
}

