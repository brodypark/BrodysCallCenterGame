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
const game = startGameServer(app.server, {
  scenarios,
  readPlayerId: (cookieHeader) => playerIdFromCookieHeader(app, cookieHeader),
  allowTestWords: !env.isProduction,
  log: app.log,
});

// Close the game (timers and open connections) before Fastify closes the HTTP server, or it
// would wait on the connections forever. Clients reconnect when the server is back.
app.addHook("preClose", (done) => {
  game.close();
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
