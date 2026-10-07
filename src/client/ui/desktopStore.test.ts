import { describe, expect, it, vi } from "vitest";
import { AppList, Apps } from "@client/ui/appList";
import { cellPosition } from "@client/ui/desktopGrid";
import { createDesktopStore } from "@client/ui/desktopStore";
import { DesktopIconGrid, DesktopLayout } from "@client/ui/layout";

function newStore(): ReturnType<typeof createDesktopStore> {
  return createDesktopStore(AppList, DesktopIconGrid, DesktopLayout.TaskbarHeight);
}

describe("desktop store: windows", () => {
  it("starts with nothing open", () => {
    const state = newStore().getState();
    expect(state.openOrder).toEqual([]);
    expect(state.stackOrder).toEqual([]);
    expect(state.startMenuOpen).toBe(false);
  });

  it("opens apps in front, and brings an open one forward instead of opening it twice", () => {
    const store = newStore();
    store.openApp("Phone");
    store.openApp("Call");
    expect(store.getState().openOrder).toEqual(["Phone", "Call"]);
    expect(store.getState().stackOrder).toEqual(["Phone", "Call"]);

    store.openApp("Phone");
    expect(store.getState().openOrder).toEqual(["Phone", "Call"]);
    expect(store.getState().stackOrder).toEqual(["Call", "Phone"]);
  });

  it("focuses only open apps", () => {
    const store = newStore();
    store.openApp("Phone");
    store.openApp("Call");
    store.focusApp("Phone");
    expect(store.getState().stackOrder).toEqual(["Call", "Phone"]);
    store.focusApp("Shop");
    expect(store.getState().stackOrder).toEqual(["Call", "Phone"]);
  });

  it("closes an app, leaving the one behind it in front", () => {
    const store = newStore();
    store.openApp("Phone");
    store.openApp("Call");
    store.closeApp("Call");
    expect(store.getState().openOrder).toEqual(["Phone"]);
    expect(store.getState().stackOrder).toEqual(["Phone"]);
  });

  it("keeps a moved window on screen and reopens it where it was left", () => {
    const store = newStore();
    const { height } = Apps.Phone.layout;
    store.openApp("Phone");

    store.moveWindow("Phone", { x: -1, y: 5 });
    const moved = store.getState().windowPositions.Phone;
    expect(moved?.x).toBe(0);
    expect(moved?.y).toBeCloseTo(1 - DesktopLayout.TaskbarHeight - height);

    store.moveWindow("Phone", { x: 0.2, y: 0.1 });
    store.closeApp("Phone");
    store.openApp("Phone");
    expect(store.getState().windowPositions.Phone).toEqual({ x: 0.2, y: 0.1 });
  });
});

describe("desktop store: icons", () => {
  it("puts every icon in its own cell, never under the Clock In panel", () => {
    const cells = Object.values(newStore().getState().iconCells);
    expect(cells).toHaveLength(AppList.length);
    expect(new Set(cells).size).toBe(AppList.length);
    for (const cell of cells) {
      expect(DesktopIconGrid.reservedCells.has(cell ?? -1)).toBe(false);
    }
  });

  it("snaps a dropped icon to the nearest free cell", () => {
    const store = newStore();
    const target = DesktopIconGrid.cellCount - 1;
    const corner = cellPosition(DesktopIconGrid, target);
    store.moveIcon("Phone", { x: corner.x + 0.001, y: corner.y + 0.001 });
    expect(store.getState().iconCells.Phone).toBe(target);
  });

  it("doesn't let two icons share a cell", () => {
    const store = newStore();
    const callCell = store.getState().iconCells.Call ?? -1;
    store.moveIcon("Phone", cellPosition(DesktopIconGrid, callCell));
    const { Phone, Call } = store.getState().iconCells;
    expect(Call).toBe(callCell);
    expect(Phone).not.toBe(callCell);
  });

  it("puts an icon dropped near home back in its own cell", () => {
    const store = newStore();
    const home = store.getState().iconCells.Phone ?? -1;
    const corner = cellPosition(DesktopIconGrid, home);
    store.moveIcon("Phone", { x: corner.x + 0.002, y: corner.y });
    expect(store.getState().iconCells.Phone).toBe(home);
  });
});

describe("desktop store: start menu and listeners", () => {
  it("toggles the start menu, and opening or focusing an app closes it", () => {
    const store = newStore();
    store.toggleStartMenu();
    expect(store.getState().startMenuOpen).toBe(true);
    store.openApp("Stats");
    expect(store.getState().startMenuOpen).toBe(false);

    store.toggleStartMenu();
    store.focusApp("Stats");
    expect(store.getState().startMenuOpen).toBe(false);
  });

  it("tells listeners about changes until they unsubscribe, and skips no-op focus", () => {
    const store = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.openApp("Phone");
    expect(listener).toHaveBeenCalledTimes(1);
    store.focusApp("Phone");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.openApp("Call");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
