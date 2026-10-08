import { describe, expect, it } from "vitest";
import {
  assignIconCells,
  cellPosition,
  clampToDesktop,
  createIconGrid,
  dragPosition,
  firstFreeCell,
  isPastDragThreshold,
  nearestFreeCell,
  type IconGridSpec,
} from "@client/ui/desktopGrid";

// Round numbers so the grid is easy to work out by hand: 6 columns of 0.1-wide icons
// 0.15 apart, and 3 rows of 0.2-tall icons 0.25 apart above a 0.1 taskbar. The reserved
// area covers only the cell in column 3, row 0 (cell 9).
const spec: IconGridSpec = {
  icon: { width: 0.1, height: 0.2 },
  gap: 0.05,
  taskbarHeight: 0.1,
  aspectRatio: 2,
  reservedArea: { x: 0.5, y: 0, width: 0.1, height: 0.1 },
};
const grid = createIconGrid(spec);
const none = new Set<number>();

describe("createIconGrid", () => {
  it("reserves no cells when there's no reserved area", () => {
    expect(createIconGrid({ ...spec, reservedArea: undefined }).reservedCells.size).toBe(0);
  });

  it("fits as many cells as there's room for", () => {
    expect(grid.columns).toBe(6);
    expect(grid.rows).toBe(3);
    expect(grid.cellCount).toBe(18);
  });

  it("numbers cells down each column, then across", () => {
    expect(cellPosition(grid, 0)).toEqual({ x: 0.05, y: 0.05 });
    expect(cellPosition(grid, 1).x).toBeCloseTo(0.05);
    expect(cellPosition(grid, 1).y).toBeCloseTo(0.3);
    expect(cellPosition(grid, 3).x).toBeCloseTo(0.2);
    expect(cellPosition(grid, 3).y).toBeCloseTo(0.05);
  });

  it("keeps every cell inside the desktop and above the taskbar", () => {
    for (let cell = 0; cell < grid.cellCount; cell++) {
      const { x, y } = cellPosition(grid, cell);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + spec.icon.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(y + spec.icon.height).toBeLessThanOrEqual(1 - spec.taskbarHeight + 1e-9);
    }
  });

  it("reserves the cells under the reserved area", () => {
    expect([...grid.reservedCells]).toEqual([9]);
  });
});

describe("firstFreeCell", () => {
  it("skips taken and reserved cells", () => {
    expect(firstFreeCell(grid, none)).toBe(0);
    expect(firstFreeCell(grid, new Set([0, 1]))).toBe(2);
    const allButReserved = new Set([...Array(grid.cellCount).keys()].filter((cell) => cell !== 9));
    expect(firstFreeCell(grid, allButReserved)).toBeUndefined();
  });
});

describe("nearestFreeCell", () => {
  it("snaps a point to the closest cell", () => {
    expect(nearestFreeCell(grid, { x: 0.21, y: 0.06 }, none)).toBe(3);
    expect(nearestFreeCell(grid, { x: 0.06, y: 0.31 }, none)).toBe(1);
  });

  it("skips a taken cell for the next closest one", () => {
    // Cell 1 (0.25 down) is closer than cell 3 (0.15 across, doubled by the aspect ratio).
    expect(nearestFreeCell(grid, cellPosition(grid, 0), new Set([0]))).toBe(1);
  });

  it("never picks a reserved cell", () => {
    // Cell 10, just below the reserved one, is closer than its neighbors across.
    expect(nearestFreeCell(grid, cellPosition(grid, 9), none)).toBe(10);
  });
});

describe("assignIconCells", () => {
  it("gives each id its own cell in order", () => {
    const cells = assignIconCells(grid, ["a", "b", "c"]);
    expect([...cells.entries()]).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("throws when there are more icons than free cells", () => {
    const ids = [...Array(grid.cellCount).keys()].map((index) => `app${index}`);
    expect(() => assignIconCells(grid, ids)).toThrow();
  });
});

describe("clampToDesktop", () => {
  const size = { width: 0.3, height: 0.4 };

  it("leaves a position that already fits alone", () => {
    expect(clampToDesktop({ x: 0.2, y: 0.3 }, size, 0.1)).toEqual({ x: 0.2, y: 0.3 });
  });

  it("keeps it inside the desktop and above the taskbar", () => {
    expect(clampToDesktop({ x: -0.5, y: -0.5 }, size, 0.1)).toEqual({ x: 0, y: 0 });
    const clamped = clampToDesktop({ x: 2, y: 2 }, size, 0.1);
    expect(clamped.x).toBeCloseTo(0.7);
    expect(clamped.y).toBeCloseTo(0.5);
  });

  it("pins something too big for the space to the top-left", () => {
    expect(clampToDesktop({ x: 0.5, y: 0.5 }, { width: 1.2, height: 0.95 }, 0.1)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("dragPosition", () => {
  const desktop = { width: 1600, height: 900 };

  it("turns pixels moved into fractions of the desktop", () => {
    const moved = dragPosition({ x: 0.1, y: 0.2 }, { x: 160, y: -90 }, desktop);
    expect(moved?.x).toBeCloseTo(0.2);
    expect(moved?.y).toBeCloseTo(0.1);
  });

  it("gives nothing while the desktop has no size", () => {
    expect(dragPosition({ x: 0.1, y: 0.2 }, { x: 10, y: 10 }, { width: 0, height: 900 })).toBe(
      undefined,
    );
    expect(dragPosition({ x: 0.1, y: 0.2 }, { x: 10, y: 10 }, { width: 1600, height: 0 })).toBe(
      undefined,
    );
  });
});

describe("isPastDragThreshold", () => {
  it("treats small wobbles as a click and bigger moves as a drag", () => {
    // 0.01 of a 900 px desktop is 9 px.
    expect(isPastDragThreshold({ x: 3, y: 4 }, 0.01, 900)).toBe(false);
    expect(isPastDragThreshold({ x: 6, y: 8 }, 0.01, 900)).toBe(true);
    expect(isPastDragThreshold({ x: -9, y: 0 }, 0.01, 900)).toBe(true);
  });
});
