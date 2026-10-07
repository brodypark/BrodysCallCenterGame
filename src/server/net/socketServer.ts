// Socket.IO for game events. Only pages from this site with a valid player cookie may
// connect. Every client event is parsed with its Zod schema and passed to the services,
// which check it against the player's state; bad events are ignored, and a failing handler
// is logged rather than crashing the server.

import type { Server as HttpServer } from "node:http";
import type { FastifyBaseLogger } from "fastify";
import { Server, type Socket } from "socket.io";
import {
  type ClientEventName,
  type ClientEventPayload,
  ClientEventSchemas,
  type IncomingClientEvents,
  type ServerToClientEvents,
} from "@shared/events";
import { ServerConfig } from "@server/config";
import { isAllowedOrigin } from "@server/net/origin";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { CallService } from "@server/services/CallService";
import { PlayerService } from "@server/services/PlayerService";

interface SocketData {
  playerId: string;
}

type GameSocket = Socket<
  IncomingClientEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

export interface GameServerOptions {
  scenarios: ScenarioRegistry;
  // The player id in a request's Cookie header, if it's there and correctly signed.
  readPlayerId: (cookieHeader: string | undefined) => string | undefined;
  log: FastifyBaseLogger;
}

export interface GameServer {
  /** Clears every player's timers and closes all connections, e.g. on shutdown. */
  close: () => void;
}

/** Parses one client event's payload and hands it to `handle` if it's valid. */
function listen<E extends ClientEventName>(
  socket: GameSocket,
  event: E,
  log: FastifyBaseLogger,
  handle: (payload: ClientEventPayload<E>) => void | Promise<void>,
): void {
  const schema = ClientEventSchemas[event];
  // Socket.IO's types can't follow a generic event name, but every incoming event has the
  // same listener type, so the plain union works.
  const name: ClientEventName = event;
  socket.on(name, (...args: unknown[]) => {
    const parsed = schema.safeParse(args[0]);
    if (!parsed.success) {
      log.debug({ event, playerId: socket.data.playerId }, "Ignored a malformed client event");
      return;
    }
    // Catches handlers that throw and handlers that return a failed promise alike.
    Promise.resolve()
      .then(() => handle(parsed.data))
      .catch((error: unknown) => {
        log.error({ err: error, event, playerId: socket.data.playerId }, "Client event failed");
      });
  });
}

export function startGameServer(httpServer: HttpServer, options: GameServerOptions): GameServer {
  const { log } = options;
  const io = new Server<
    IncomingClientEvents,
    ServerToClientEvents,
    Record<never, never>,
    SocketData
  >(httpServer, {
    // The client bundles socket.io-client itself.
    serveClient: false,
    maxHttpBufferSize: ServerConfig.MaxSocketMessageBytes,
    // Only pages from this site may connect.
    allowRequest: (request, callback) => {
      callback(null, isAllowedOrigin(request.headers.origin, request.headers.host));
    },
  });

  const players = new PlayerService<GameSocket>({
    onReplaced: (socket) => {
      socket.emit("session:replaced");
      socket.disconnect(true);
    },
    onPlayerGone: (playerId) => {
      calls.removePlayer(playerId);
      log.info({ playerId }, "Player didn't come back; cleared their game");
    },
  });
  const calls = new CallService({
    scenarios: options.scenarios,
    send: (playerId, snapshot) => {
      players.activeSocket(playerId)?.emit("call:snapshot", snapshot);
    },
  });

  // No valid player cookie, no connection. The client gets a new cookie and tries again.
  io.use((socket, next) => {
    const playerId = options.readPlayerId(socket.request.headers.cookie);
    if (playerId === undefined) {
      next(new Error("No valid player cookie."));
      return;
    }
    socket.data.playerId = playerId;
    next();
  });

  io.on("connection", (socket) => {
    const { playerId } = socket.data;
    log.info({ playerId, socketId: socket.id }, "Player connected");
    players.connect(playerId, socket);
    // Does nothing if they're coming back within the grace period: their call carries on.
    calls.addPlayer(playerId);
    const snapshot = calls.snapshot(playerId);
    if (snapshot) {
      socket.emit("call:snapshot", snapshot);
    }

    listen(socket, "call:answer", log, () => calls.answer(playerId));
    listen(socket, "call:decline", log, () => calls.decline(playerId));
    listen(socket, "call:hangUp", log, () => calls.hangUp(playerId));
    listen(socket, "call:send", log, ({ text }) => calls.sendMessage(playerId, text));
    listen(socket, "call:finishedSpeaking", log, ({ lineId }) =>
      calls.finishedSpeaking(playerId, lineId),
    );

    socket.on("disconnect", (reason) => {
      log.info({ playerId, socketId: socket.id, reason }, "Player disconnected");
      players.disconnect(playerId, socket);
    });
  });

  return {
    close: () => {
      calls.removeAll();
      players.shutdown();
      // Drops every connection; clients reconnect when the server is back.
      io.engine.close();
    },
  };
}
