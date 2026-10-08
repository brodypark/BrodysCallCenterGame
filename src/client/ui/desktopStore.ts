// The state of one desktop: which windows are open, their order front to back, where
// windows and icons have been moved, and whether the start menu and title menu are open. Plain TypeScript,
// so it's unit tested without React; components read it with useDesktopState().
// One store per desktop, so a future office can show several. Positions last until the
// page reloads.

import type { AppId, AppInfo } from "@client/ui/appList";
import {
  assignIconCells,
  clampToDesktop,
  nearestFreeCell,
  type IconGrid,
  type Point,
} from "@client/ui/desktopGrid";

export interface DesktopState {
  // Open apps in the order they were opened. Taskbar buttons follow this order.
  readonly openOrder: readonly AppId[];
  // Open apps from back to front. The last one is focused.
  readonly stackOrder: readonly AppId[];
  // Where each window was last dragged to, kept after it closes so it reopens there.
  readonly windowPositions: Readonly<Partial<Record<AppId, Point>>>;
  // The grid cell each app's icon is in.
  readonly iconCells: Readonly<Partial<Record<AppId, number>>>;
  readonly startMenuOpen: boolean;
  // Whether the title menu covers the desktop between shifts (the player can go to the desk
  // to use the Shop and Stats, and come back from the taskbar).
  readonly titleMenuOpen: boolean;
}

export interface DesktopStore {
  getState: () => DesktopState;
  subscribe: (listener: () => void) => () => void;
  /** Opens an app's window, or brings it to the front if it's already open. */
  openApp: (id: AppId) => void;
  closeApp: (id: AppId) => void;
  /** Brings an open app's window to the front. */
  focusApp: (id: AppId) => void;
  /** Moves a window, keeping it inside the desktop and above the taskbar. */
  moveWindow: (id: AppId, position: Point) => void;
  /** Drops an icon at `position`; it snaps to the nearest free cell. */
  moveIcon: (id: AppId, position: Point) => void;
  setStartMenuOpen: (open: boolean) => void;
  toggleStartMenu: () => void;
  setTitleMenuOpen: (open: boolean) => void;
}

function without(list: readonly AppId[], id: AppId): AppId[] {
  return list.filter((item) => item !== id);
}

export function createDesktopStore(
  apps: readonly AppInfo[],
  grid: IconGrid,
  taskbarHeight: number,
): DesktopStore {
  const appsById = new Map(apps.map((app) => [app.id, app]));
  const listeners = new Set<() => void>();

  let state: DesktopState = {
    openOrder: [],
    stackOrder: [],
    windowPositions: {},
    iconCells: Object.fromEntries(
      assignIconCells(
        grid,
        apps.map((app) => app.id),
      ),
    ),
    startMenuOpen: false,
    titleMenuOpen: true,
  };

  function update(changes: Partial<DesktopState>): void {
    state = { ...state, ...changes };
    for (const listener of listeners) {
      listener();
    }
  }

  function focusApp(id: AppId): void {
    if (!state.openOrder.includes(id)) {
      return;
    }
    // Already in front with the menu shut: nothing to change, so don't re-render.
    if (state.stackOrder.at(-1) === id && !state.startMenuOpen) {
      return;
    }
    update({ stackOrder: [...without(state.stackOrder, id), id], startMenuOpen: false });
  }

  return {
    getState: () => state,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    openApp: (id) => {
      if (!appsById.has(id)) {
        return;
      }
      if (state.openOrder.includes(id)) {
        focusApp(id);
        return;
      }
      update({
        openOrder: [...state.openOrder, id],
        stackOrder: [...state.stackOrder, id],
        startMenuOpen: false,
      });
    },

    closeApp: (id) => {
      if (!state.openOrder.includes(id)) {
        return;
      }
      update({
        openOrder: without(state.openOrder, id),
        stackOrder: without(state.stackOrder, id),
        startMenuOpen: false,
      });
    },

    focusApp,

    moveWindow: (id, position) => {
      const app = appsById.get(id);
      if (!app) {
        return;
      }
      const clamped = clampToDesktop(position, app.layout, taskbarHeight);
      update({ windowPositions: { ...state.windowPositions, [id]: clamped } });
    },

    moveIcon: (id, position) => {
      const current = state.iconCells[id];
      if (current === undefined) {
        return;
      }
      // Every other icon's cell is taken. This icon's own cell is free, so dropping it near
      // home puts it back.
      const taken = new Set<number>();
      for (const [otherId, cell] of Object.entries(state.iconCells)) {
        if (otherId !== id && cell !== undefined) {
          taken.add(cell);
        }
      }
      const cell = nearestFreeCell(grid, position, taken) ?? current;
      update({ iconCells: { ...state.iconCells, [id]: cell } });
    },

    setStartMenuOpen: (open) => {
      if (state.startMenuOpen !== open) {
        update({ startMenuOpen: open });
      }
    },

    toggleStartMenu: () => {
      update({ startMenuOpen: !state.startMenuOpen });
    },

    setTitleMenuOpen: (open) => {
      if (state.titleMenuOpen !== open) {
        update({ titleMenuOpen: open, startMenuOpen: false });
      }
    },
  };
}
