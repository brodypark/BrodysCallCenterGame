import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { CallService } from "@server/services/CallService";
import { DataService } from "@server/services/DataService";
import { endPlayerSession } from "@server/services/playerExit";
import { RedeemService } from "@server/services/RedeemService";
import { SaveService } from "@server/services/SaveService";
import { ShiftService } from "@server/services/ShiftService";
import { StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
let data: DataService;

beforeEach(() => {
  vi.useFakeTimers();
  data = new DataService(":memory:");
});

afterEach(() => {
  vi.useRealTimers();
  data.close();
});

/** Every service wired the way the socket server does it. */
function createGame(): {
  services: Parameters<typeof endPlayerSession>[0];
  shifts: ShiftService;
  saves: SaveService;
  calls: CallService;
} {
  const stats: StatsService = new StatsService({
    send: () => undefined,
    save: (playerId, snapshot) => saves.save(playerId, snapshot),
  });
  const redeem: RedeemService = new RedeemService({
    onRedeemed: (playerId, card) => shifts.cardRedeemed(playerId, card),
  });
  const calls = new CallService({
    scenarios: createScenarioRegistry([grandma]),
    codes: redeem,
    allowTestWords: true,
    statsOf: (playerId) => stats.get(playerId),
    send: () => undefined,
  });
  const shifts: ShiftService = new ShiftService({
    calls,
    cards: redeem,
    stats,
    canClockIn: (playerId) => saves.activeSlot(playerId) !== null,
    unlockedBetween: () => [],
    send: () => undefined,
    sendResult: () => undefined,
  });
  const saves: SaveService = new SaveService({
    data,
    stats,
    isBusy: (playerId) => shifts.isOnShift(playerId),
    onLeave: (playerId) => shifts.resultSeen(playerId),
    send: () => undefined,
  });
  calls.setListener({
    callEnded: (playerId, reason) => shifts.callEnded(playerId, reason),
    turnChanged: (playerId) => shifts.turnChanged(playerId),
  });
  calls.addPlayer(PlayerId);
  return { services: { shifts, calls, cards: redeem, stats, saves }, shifts, saves, calls };
}

describe("endPlayerSession", () => {
  it("saves an unfinished shift to the slot as failed, then clears the session", () => {
    const game = createGame();
    game.saves.newGame(PlayerId, 2);
    game.shifts.clockIn(PlayerId);
    vi.advanceTimersByTime(secondsToMs(Config.Call.FirstCallDelaySeconds));

    endPlayerSession(game.services, PlayerId);

    expect(data.readSlot(PlayerId, 2)).toMatchObject({ stats: { shiftsFailed: 1 } });
    expect(game.saves.activeSlot(PlayerId)).toBeNull();
    expect(game.calls.hasPlayer(PlayerId)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves the save alone for a player who wasn't on shift", () => {
    const game = createGame();
    game.saves.newGame(PlayerId, 1);
    endPlayerSession(game.services, PlayerId);
    expect(data.readSlot(PlayerId, 1)).toMatchObject({ stats: { shiftsFailed: 0 } });
  });
});
