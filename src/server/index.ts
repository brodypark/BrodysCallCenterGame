// Server entry point: Fastify for HTTP, Socket.IO for game events. In production it also
// serves the built client; in development Vite does that and forwards /api and /socket.io
// here.

import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { z } from "zod";
import { ServerConfig } from "@server/config";
import { loadServerEnv } from "@server/env";
import { playerIdFromCookieHeader, registerSessionRoute } from "@server/net/playerSession";
import { startGameServer } from "@server/net/socketServer";
import { AllScenarios } from "@server/scenarios/all";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { AIService } from "@server/services/AIService";
import { DataService } from "@server/services/DataService";
import { createGeminiModel } from "@server/services/GeminiClient";
import { RateLimiter } from "@server/services/RateLimiter";
import { VoiceService } from "@server/services/VoiceService";
import { ApiRoutes } from "@shared/api";
import { Config } from "@shared/Config";

const env = loadServerEnv();
const app = Fastify({ logger: true, trustProxy: env.isProduction });

if (env.usingDevCookieSecret) {
  app.log.warn("COOKIE_SECRET isn't set, so the development fallback is signing cookies.");
}
await app.register(fastifyCookie, { secret: env.cookieSecret });
registerSessionRoute(app, { secure: env.isProduction });

if (env.isProduction) {
  await app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, ServerConfig.ClientBuildDir),
  });
}

// Checks every scenario now, so a broken one stops the server with a clear message.
const scenarios = createScenarioRegistry(AllScenarios);
// Opens (or creates) the saves database now, so a problem stops the server at startup.
const data = new DataService(path.resolve(import.meta.dirname, ServerConfig.Database.Path));
// Victims' replies come from Gemini when there's a key and the cost switch allows it;
// otherwise every victim uses scripted replies.
let replies: AIService | undefined;
if (Config.AI.UseScriptedReplies) {
  app.log.info("Config.AI.UseScriptedReplies is on, so victims use scripted replies.");
} else if (env.geminiApiKey === undefined) {
  app.log.warn(
    env.geminiBackupApiKey === undefined
      ? "GEMINI_API_KEY isn't set, so victims use scripted replies."
      : "GEMINI_API_KEY isn't set (GEMINI_API_KEY_BACKUP is only a backup), so victims use scripted replies.",
  );
} else {
  const { PerMinute, PerDay, GlobalPerDay } = ServerConfig.AILimits;
  const limiter = new RateLimiter({
    perMinute: PerMinute,
    perDay: PerDay,
    globalPerDay: GlobalPerDay,
  });
  const keys = [env.geminiApiKey, env.geminiBackupApiKey].filter(
    (key): key is string => key !== undefined,
  );
  replies = new AIService({
    models: keys.map((key) => createGeminiModel(key)),
    allowRequest: (playerId) => {
      const allowed = limiter.tryTake(playerId);
      if (allowed) {
        app.log.info({ type: "usage", service: "gemini", playerId, amount: 1 }, "Gemini requested");
      }
      return allowed;
    },
    log: app.log,
  });
  app.log.info(
    { models: [Config.AI.Model, ...Config.AI.FallbackModels], keys: keys.length },
    "Victims reply with Gemini.",
  );
}

const game = startGameServer(app.server, {
  scenarios,
  data,
  readPlayerId: (cookieHeader) => playerIdFromCookieHeader(app, cookieHeader),
  allowTestWords: !env.isProduction,
  shiftSecondsOverride: env.shiftSecondsOverride,
  replies,
  log: app.log,
});

// Victims speak with ElevenLabs when there's a key and the cost switch allows it; otherwise
// their lines are subtitles only.
let voice: VoiceService | undefined;
if (Config.Voice.TypedOnly) {
  app.log.info("Config.Voice.TypedOnly is on, so victims don't speak.");
} else if (env.elevenLabsApiKey === undefined) {
  app.log.warn("ELEVENLABS_API_KEY isn't set, so victims don't speak.");
} else {
  const { PerMinute, PerDayCharacters, GlobalPerDayCharacters } = ServerConfig.VoiceLimits;
  const limiter = new RateLimiter({
    perMinute: PerMinute,
    perDay: PerDayCharacters,
    globalPerDay: GlobalPerDayCharacters,
  });
  voice = new VoiceService({
    apiKey: env.elevenLabsApiKey,
    allowLine: (playerId, characters) => {
      const allowed = limiter.tryTake(playerId, characters);
      if (allowed) {
        app.log.info({ type: "usage", service: "elevenlabs", playerId, amount: characters }, "Voice generated");
      }
      return allowed;
    },
    log: app.log,
  });
  app.log.info({ model: ServerConfig.ElevenLabs.Model }, "Victims speak with ElevenLabs.");
}

const voiceParamsSchema = z.strictObject({ lineId: z.coerce.number().int().positive() });

// Lightweight health check for hosting providers (Render, Fly.io).
app.get("/health", async (request, reply) => {
  return reply.status(200).send({ status: "ok" });
});

import { createReadStream } from "node:fs";

// Admin-only backup route to download the SQLite database.
app.get("/backup", async (request, reply) => {
  if (!env.adminSecret) {
    return reply.status(404).send({ error: "Backups not configured." });
  }
  const auth = request.headers.authorization;
  if (auth !== `Bearer ${env.adminSecret}`) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const dbPath = path.resolve(import.meta.dirname, ServerConfig.Database.Path);
  return reply
    .header("Content-Type", "application/vnd.sqlite3")
    .header("Content-Disposition", 'attachment; filename="scamgpt.sqlite"')
    .send(createReadStream(dbPath));
});

// The audio for the victim line the player's call is on right now, streamed as it's made
// (the client waits for all of it before playing; the fast model makes it in well under the
// line's length). Each line can be fetched once (CallService.claimLineForVoice), so nothing gets paid for
// twice. Any failure is a 4xx/5xx and the client shows the line as subtitles only.
app.get(`${ApiRoutes.VictimVoice}/:lineId`, async (request, reply) => {
  const playerId = playerIdFromCookieHeader(app, request.headers.cookie);
  if (playerId === undefined) {
    return reply.status(401).send({ error: "No valid player cookie." });
  }
  if (voice === undefined) {
    return reply.status(404).send({ error: "Victims don't speak right now." });
  }
  const params = voiceParamsSchema.safeParse(request.params);
  const line = params.success ? game.calls.claimLineForVoice(playerId, params.data.lineId) : null;
  if (line === null) {
    return reply.status(409).send({ error: "That line isn't being said, or already was." });
  }
  // Stops the ElevenLabs request if the player leaves or the client gives up waiting.
  const cancel = new AbortController();
  reply.raw.on("close", () => cancel.abort());
  if (reply.raw.destroyed || request.raw.socket.destroyed) {
    // Gone before the listener was added (e.g. hung up as the line arrived).
    cancel.abort();
  }
  const result = await voice.speak(playerId, line.text, line.voice, cancel.signal);
  if (cancel.signal.aborted) {
    if (result.ok) {
      result.audio.destroy();
    }
    return reply;
  }
  if (!result.ok) {
    return reply
      .status(result.reason === "limit" ? 429 : 502)
      .send({ error: "No voice for this line." });
  }
  return reply
    .header("Content-Type", "audio/mpeg")
    .header("Cache-Control", "no-store")
    .send(result.audio);
});

// Close the game (timers and open connections) before Fastify closes the HTTP server, or it
// would wait on the connections forever. Clients reconnect when the server is back.
app.addHook("preClose", (done) => {
  game.close();
  data.close();
  done();
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  // A request that never finishes (e.g. a stuck stream) would otherwise keep the process
  // alive forever.
  setTimeout(() => {
    app.log.error("Shutdown timed out; exiting anyway");
    process.exit(1);
  }, ServerConfig.ShutdownTimeoutMs).unref();
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Shutdown failed");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown(signal));
}

try {
  await app.listen({ port: env.port, host: env.host });
} catch (error) {
  app.log.error(error, "Could not start the server");
  process.exit(1);
}
