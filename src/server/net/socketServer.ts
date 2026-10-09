// Socket.IO for game events. Only pages from this site with a valid player cookie may
// connect. Every client event and request is parsed with its Zod schema and passed to the
// services, which check it against the player's state; bad ones are ignored, and a failing
// handler is logged rather than crashing the server.

import type { Server as HttpServer } from "node:http";
import type { FastifyBaseLogger } from "fastify";
import { Server, type Socket } from "socket.io";
import {
  type ClientEventName,
  type ClientEventPayload,
  ClientEventSchemas,
  type ClientRequestName,
  type ClientRequestPayload,
  type ClientRequestResponses,
  ClientRequestSchemas,
  type IncomingClientEvents,
  type ServerToClientEvents,
} from "@shared/events";
import { ServerConfig } from "@server/config";
import { isAllowedOrigin } from "@server/net/origin";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { VictimReplySource } from "@server/services/AIService";
import { CallService } from "@server/services/CallService";
import { CharacterService } from "@server/services/CharacterService";
import { MailService } from "@server/services/MailService";
import { PlayerService } from "@server/services/PlayerService";
import { extraRedeemTries } from "@shared/Upgrades";
import type { DataService } from "@server/services/DataService";
import { RedeemService } from "@server/services/RedeemService";
import { SandboxService } from "@server/services/SandboxService";
import { matchDevCommand } from "@server/prompts/DevCommands";
import { endPlayerSession } from "@server/services/playerExit";
import { SaveService } from "@server/services/SaveService";
import { ShiftService } from "@server/services/ShiftService";
import { ShopService } from "@server/services/ShopService";
import { StatsService } from "@server/services/StatsService";

interface SocketData {
  playerId: string;
  // The inbox and Characters pages last sent on this connection, as JSON, so they're only
  // sent again when they change (they're rebuilt on every stats change).
  mailSent?: string;
  charactersSent?: string;
}

type GameSocket = Socket<
  IncomingClientEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

export interface GameServerOptions {
  scenarios: ScenarioRegistry;
  data: DataService;
  // The player id in a request's Cookie header, if it's there and correctly signed.
  readPlayerId: (cookieHeader: string | undefined) => string | undefined;
  // Whether the test words (!reveal, !sus, !calm) work. Never in production.
  allowTestWords: boolean;
  // A shorter shift for testing (development only).
  shiftSecondsOverride: number | undefined;
  // Where victims' AI replies come from; undefined means scripted replies only.
  replies: VictimReplySource | undefined;
  log: FastifyBaseLogger;
}

export interface GameServer {
  /** Clears every player's timers and closes all connections, e.g. on shutdown. */
  close: () => void;
  /** The CallService, exposed for HTTP routes (e.g. voice streaming). */
  calls: CallService;
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

/** Parses one client request's payload, hands it to `handle` if it's valid, and sends the
 * client the answer. A request without a way to answer it is ignored. */
function answer<R extends ClientRequestName>(
  socket: GameSocket,
  request: R,
  log: FastifyBaseLogger,
  handle: (payload: ClientRequestPayload<R>) => ClientRequestResponses[R],
): void {
  const schema = ClientRequestSchemas[request];
  const name: ClientRequestName = request;
  socket.on(name, (...args: unknown[]) => {
    const reply = args[1];
    const parsed = schema.safeParse(args[0]);
    if (typeof reply !== "function" || !parsed.success) {
      log.debug({ request, playerId: socket.data.playerId }, "Ignored a malformed client request");
      return;
    }
    // Checked to be a function just above; Socket.IO passes the client's answer callback.
    const respond = reply as (response: ClientRequestResponses[R]) => void;
    Promise.resolve()
      .then(() => respond(handle(parsed.data)))
      .catch((error: unknown) => {
        log.error({ err: error, request, playerId: socket.data.playerId }, "Client request failed");
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
      try {
        endPlayerSession(exitServices, playerId);
        log.info({ playerId }, "Player didn't come back; saved and cleared their session");
      } catch (error) {
        log.error({ err: error, playerId }, "Couldn't end the player's session cleanly");
      }
    },
  });
  const toPlayer = (playerId: string): GameSocket | undefined => players.activeSocket(playerId);

  const stats = new StatsService({
    send: (playerId, snapshot) => {
      const socket = toPlayer(playerId);
      if (!socket) {
        return;
      }
      socket.emit("stats:snapshot", snapshot);
      // A level can unlock a caller, a scam a hint, and both send mail. A failure here is
      // logged, never passed back to whatever changed the stats (e.g. a payout).
      try {
        characters.publish(playerId);
        mail.publish(playerId);
      } catch (error) {
        log.error({ err: error, playerId }, "Couldn't send the Characters pages or inbox");
      }
    },
    save: (playerId, snapshot) => {
      try {
        saves.save(playerId, snapshot);
      } catch (error) {
        log.error({ err: error, playerId }, "Couldn't save the player's stats");
      }
    },
  });
  // Notes a scam or charge on the caller's Characters page. A failure is logged, so it can
  // never stop the card paying out.
  const recordOnPage = (playerId: string, record: () => void): void => {
    try {
      record();
    } catch (error) {
      log.error({ err: error, playerId }, "Couldn't update a caller's Characters page");
    }
  };
  const redeem = new RedeemService({
    // The caller's page first, so a shift this ends counts what was learned.
    onRedeemed: (playerId, card) => {
      recordOnPage(playerId, () => characters.scammed(playerId, card.scenarioId));
      shifts.cardRedeemed(playerId, card);
    },
    onCharged: (playerId, amount, scenarioId) => {
      recordOnPage(playerId, () => characters.charged(playerId, scenarioId));
      shifts.cardCharged(playerId, amount);
    },
    onLocked: (playerId) => shifts.cardLocked(playerId),
    extraTries: (playerId) => extraRedeemTries(stats.get(playerId)),
  });
  const sandbox = new SandboxService({
    scenarios: options.scenarios,
    stats,
    isSandbox: (playerId) => saves.modeOf(playerId) === "sandbox",
    aiAvailable: options.replies !== undefined,
    send: (playerId, snapshot) => toPlayer(playerId)?.emit("sandbox:snapshot", snapshot),
  });
  const calls = new CallService({
    scenarios: options.scenarios,
    codes: redeem,
    allowTestWords: options.allowTestWords,
    statsOf: (playerId) => stats.get(playerId),
    devCommand: !options.allowTestWords
      ? undefined
      : (playerId, text) => {
          const change = matchDevCommand(text);
          if (change) {
            stats.update(playerId, change);
          }
          return change !== null;
        },
    send: (playerId, snapshot) => toPlayer(playerId)?.emit("call:snapshot", snapshot),
    replies: options.replies,
    sandbox,
  });
  const shifts: ShiftService = new ShiftService({
    calls,
    cards: redeem,
    stats,
    lengthSeconds: options.shiftSecondsOverride,
    // Only Campaign has shifts.
    canClockIn: (playerId) => saves.modeOf(playerId) === "campaign",
    unlockedBetween: (fromLevel, toLevel) =>
      options.scenarios.unlockedBetween(fromLevel, toLevel).map((scenario) => scenario.displayName),
    // Runs from the shift timer, so a failure is logged rather than thrown.
    onEnded: (playerId, summary) => {
      try {
        mail.shiftEnded(playerId, summary);
      } catch (error) {
        log.error({ err: error, playerId }, "Couldn't send the shift's emails");
      }
    },
    send: (playerId, snapshot) => toPlayer(playerId)?.emit("shift:snapshot", snapshot),
    sendResult: (playerId, result) => toPlayer(playerId)?.emit("shift:ended", result),
  });
  const saves: SaveService = new SaveService({
    data: options.data,
    stats,
    isBusy: (playerId) => shifts.isOnShift(playerId),
    onLeave: (playerId) => {
      shifts.resultSeen(playerId);
      // Leaving Sandbox stops its calls; its cards (no shift to clear them) go too.
      sandbox.leave(playerId);
      redeem.clearCards(playerId);
    },
    send: (playerId, snapshot) => toPlayer(playerId)?.emit("saves:snapshot", snapshot),
  });
  const characters: CharacterService = new CharacterService({
    scenarios: options.scenarios,
    stats,
    revealAll: (playerId) => saves.modeOf(playerId) === "sandbox",
    send: (playerId, snapshot) => {
      const socket = toPlayer(playerId);
      const json = JSON.stringify(snapshot);
      if (socket && socket.data.charactersSent !== json) {
        socket.data.charactersSent = json;
        socket.emit("characters:snapshot", snapshot);
      }
    },
    onLearned: (playerId, scenarioId) => mail.learned(playerId, scenarioId),
  });
  const mail: MailService = new MailService({
    scenarios: options.scenarios,
    stats,
    isCampaign: (playerId) => saves.modeOf(playerId) === "campaign",
    send: (playerId, snapshot) => {
      const socket = toPlayer(playerId);
      const json = JSON.stringify(snapshot);
      if (socket && socket.data.mailSent !== json) {
        socket.data.mailSent = json;
        socket.emit("mail:snapshot", snapshot);
      }
    },
  });
  const shop = new ShopService({
    stats,
    closedReason: (playerId) => {
      if (saves.activeSlot(playerId) === null) {
        return "noSave";
      }
      return shifts.isOnShift(playerId) ? "onShift" : null;
    },
    isFree: (playerId) => saves.modeOf(playerId) === "sandbox",
  });
  sandbox.setCalls(calls);
  const exitServices = { shifts, calls, cards: redeem, stats, saves };
  calls.setListener({
    callEnded: (playerId, reason) => shifts.callEnded(playerId, reason),
    turnChanged: (playerId) => shifts.turnChanged(playerId),
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

  const connectionsPerIp = new Map<string, number>();
  const MAX_CONNECTIONS_PER_IP = 10;

  io.on("connection", (socket) => {
    const ip = socket.handshake.address;
    const currentConnections = connectionsPerIp.get(ip) ?? 0;
    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
      log.warn({ ip }, "Too many connections from IP, disconnecting");
      socket.disconnect(true);
      return;
    }
    connectionsPerIp.set(ip, currentConnections + 1);

    const { playerId } = socket.data;
    log.info({ playerId, socketId: socket.id, ip }, "Player connected");
    players.connect(playerId, socket);
    // Does nothing if they're coming back within the grace period: their call carries on.
    calls.addPlayer(playerId);
    const snapshot = calls.snapshot(playerId);
    if (snapshot) {
      socket.emit("call:snapshot", snapshot);
    }
    socket.emit("shift:snapshot", shifts.snapshot(playerId));
    socket.emit("stats:snapshot", stats.get(playerId));
    characters.publish(playerId);
    mail.publish(playerId);
    // With no save picked (a new visit), the client shows the slot picker. Reading the
    // slots touches the database, so a failure is logged rather than crashing the server.
    try {
      socket.emit("saves:snapshot", saves.snapshot(playerId));
    } catch (error) {
      log.error({ err: error, playerId }, "Couldn't read the player's save slots");
    }
    const sandboxSnapshot = sandbox.snapshot(playerId);
    if (sandboxSnapshot) {
      socket.emit("sandbox:snapshot", sandboxSnapshot);
    }
    const report = shifts.unseenResult(playerId);
    if (report) {
      socket.emit("shift:ended", report);
    }

    // Perks change the shift length the shift snapshot shows, so it's sent again whenever
    // they can change: picking a save, and buying.
    const sendShift = (): void => {
      socket.emit("shift:snapshot", shifts.snapshot(playerId));
    };
    listen(socket, "saves:continue", log, ({ slot }) => {
      saves.continueSlot(playerId, slot);
      mail.savePicked(playerId);
      sendShift();
    });
    listen(socket, "saves:new", log, ({ slot }) => {
      saves.newGame(playerId, slot);
      mail.savePicked(playerId);
      sendShift();
    });
    listen(socket, "saves:delete", log, ({ slot }) => saves.deleteSlot(playerId, slot));
    listen(socket, "saves:leave", log, () => {
      shifts.abandon(playerId, true);
      saves.leave(playerId);
    });
    listen(socket, "sandbox:enter", log, () => {
      saves.enterSandbox(playerId);
      sandbox.enter(playerId);
    });
    listen(socket, "sandbox:settings", log, (change) => sandbox.update(playerId, change));
    listen(socket, "sandbox:ringNow", log, () => sandbox.ringNow(playerId));
    listen(socket, "sandbox:trust", log, ({ percent }) => sandbox.setTrust(playerId, percent));
    listen(socket, "sandbox:cheat", log, ({ cheat }) => sandbox.cheat(playerId, cheat));
    listen(socket, "sandbox:wear", log, ({ id }) => sandbox.wear(playerId, id));
    listen(socket, "sandbox:reset", log, () => sandbox.reset(playerId));
    // Nothing starts until a save is picked (ShiftService checks).
    listen(socket, "shift:clockIn", log, () => shifts.clockIn(playerId));
    listen(socket, "shift:resultSeen", log, () => shifts.resultSeen(playerId));
    listen(socket, "call:answer", log, () => calls.answer(playerId));
    listen(socket, "call:decline", log, () => calls.decline(playerId));
    listen(socket, "call:hangUp", log, () => calls.hangUp(playerId));
    listen(socket, "call:send", log, ({ text }) => calls.sendMessage(playerId, text));
    listen(socket, "call:finishedSpeaking", log, ({ lineId }) =>
      calls.finishedSpeaking(playerId, lineId),
    );
    answer(socket, "redeem:code", log, ({ code }) => redeem.redeem(playerId, code));
    answer(socket, "wobblebucks:charge", log, ({ card, amount }) =>
      redeem.charge(playerId, card, amount),
    );
    answer(socket, "shop:buy", log, ({ id }) => {
      const result = shop.buy(playerId, id);
      sendShift();
      return result;
    });
    answer(socket, "shop:equip", log, ({ id }) => shop.equip(playerId, id));
    listen(socket, "mail:read", log, ({ id }) => mail.read(playerId, id));
    listen(socket, "tutorial:seen", log, () => {
      if (saves.activeSlot(playerId) !== null && !stats.get(playerId).tutorialSeen) {
        stats.update(playerId, (current) => {
          current.tutorialSeen = true;
        });
      }
    });

    socket.on("disconnect", (reason) => {
      log.info({ playerId, socketId: socket.id, reason, ip }, "Player disconnected");
      players.disconnect(playerId, socket);
      
      const count = connectionsPerIp.get(ip);
      if (count !== undefined) {
        if (count <= 1) {
          connectionsPerIp.delete(ip);
        } else {
          connectionsPerIp.set(ip, count - 1);
        }
      }
    });
  });

  return {
    calls,
    close: () => {
      // Shifts still going are cut short and saved, like a player leaving.
      for (const playerId of saves.activePlayers()) {
        try {
          shifts.abandon(playerId);
        } catch (error) {
          log.error({ err: error, playerId }, "Couldn't save a shift on shutdown");
        }
      }
      shifts.removeAll();
      saves.removeAll();
      calls.removeAll();
      redeem.removeAll();
      stats.removeAll();
      players.shutdown();
      // Drops every connection; clients reconnect when the server is back.
      io.engine.close();
    },
  };
}
