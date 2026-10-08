// Server entry point: Fastify for HTTP, Socket.IO for game events. In production it also
// serves the built client; in development Vite does that and forwards /api and /socket.io
// here.

import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
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
import { Config } from "@shared/Config";

const env = loadServerEnv();
const app = Fastify({ logger: true });

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
  app.log.warn("GEMINI_API_KEY isn't set, so victims use scripted replies.");
} else {
  const { PerMinute, PerDay, GlobalPerDay } = ServerConfig.AILimits;
  const limiter = new RateLimiter({
    perMinute: PerMinute,
    perDay: PerDay,
    globalPerDay: GlobalPerDay,
  });
  replies = new AIService({
    model: createGeminiModel(env.geminiApiKey),
    allowRequest: (playerId) => limiter.tryTake(playerId),
    log: app.log,
  });
  app.log.info({ model: Config.AI.Model }, "Victims reply with Gemini.");
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
