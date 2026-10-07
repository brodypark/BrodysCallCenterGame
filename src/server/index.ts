// Server entry point: Fastify for HTTP, Socket.IO for game events. In production it also
// serves the built client; in development Vite does that and forwards /socket.io here.

import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { Server } from "socket.io";
import { ServerConfig } from "@server/config";
import { loadServerEnv } from "@server/env";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/events";

const env = loadServerEnv();
const app = Fastify({ logger: true });

if (env.isProduction) {
  await app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, ServerConfig.ClientBuildDir),
  });
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  // The client bundles socket.io-client itself.
  serveClient: false,
});

io.on("connection", (socket) => {
  app.log.info({ socketId: socket.id }, "Client connected");
  socket.emit("hello", { message: "Hello from the ScamGPT server." });
  socket.on("disconnect", (reason) => {
    app.log.info({ socketId: socket.id, reason }, "Client disconnected");
  });
});

// Close the open socket connections before Fastify closes the HTTP server, or it would wait
// on them forever. Clients see a dropped connection and reconnect when the server is back.
app.addHook("preClose", (done) => {
  io.engine.close();
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
