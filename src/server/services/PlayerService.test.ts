import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerService } from "@server/services/PlayerService";

const GraceSeconds = 30;
const MsPerSecond = 1000;

interface FakeSocket {
  id: string;
}

function setup(): {
  players: PlayerService<FakeSocket>;
  replaced: FakeSocket[];
  gone: string[];
} {
  const replaced: FakeSocket[] = [];
  const gone: string[] = [];
  const players = new PlayerService<FakeSocket>({
    onReplaced: (socket) => replaced.push(socket),
    onPlayerGone: (playerId) => gone.push(playerId),
    graceSeconds: GraceSeconds,
  });
  return { players, replaced, gone };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlayerService", () => {
  it("lets a new tab take over, telling the old one", () => {
    const { players, replaced } = setup();
    const first = { id: "tab-1" };
    const second = { id: "tab-2" };
    players.connect("p", first);
    players.connect("p", second);
    expect(replaced).toEqual([first]);
    expect(players.activeSocket("p")).toBe(second);
  });

  it("ignores the replaced tab disconnecting", () => {
    const { players, gone } = setup();
    const first = { id: "tab-1" };
    const second = { id: "tab-2" };
    players.connect("p", first);
    players.connect("p", second);
    players.disconnect("p", first);
    vi.advanceTimersByTime(GraceSeconds * MsPerSecond);
    expect(players.activeSocket("p")).toBe(second);
    expect(gone).toEqual([]);
  });

  it("forgets a player who doesn't come back within the grace period", () => {
    const { players, gone } = setup();
    const socket = { id: "tab-1" };
    players.connect("p", socket);
    players.disconnect("p", socket);
    expect(players.activeSocket("p")).toBeUndefined();

    vi.advanceTimersByTime(GraceSeconds * MsPerSecond - 1);
    expect(gone).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(gone).toEqual(["p"]);
  });

  it("keeps a player who reconnects within the grace period", () => {
    const { players, gone, replaced } = setup();
    players.connect("p", { id: "tab-1" });
    players.disconnect("p", { id: "tab-1" });
    vi.advanceTimersByTime((GraceSeconds / 2) * MsPerSecond);
    players.connect("p", { id: "tab-1-again" });
    vi.advanceTimersByTime(GraceSeconds * MsPerSecond);
    expect(gone).toEqual([]);
    expect(replaced).toEqual([]);
  });

  it("clears every grace timer on shutdown", () => {
    const { players, gone } = setup();
    players.connect("a", { id: "1" });
    players.connect("b", { id: "2" });
    players.disconnect("a", { id: "1" });
    players.disconnect("b", { id: "2" });
    expect(vi.getTimerCount()).toBe(2);
    players.shutdown();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(GraceSeconds * MsPerSecond);
    expect(gone).toEqual([]);
  });
});
