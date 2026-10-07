// Desktop geometry: the invisible grid desktop icons snap to, and keeping things on screen.
// Every position and size is a fraction of the desktop (x and width of its width, y and
// height of its height). The desktop always keeps the same shape, so these stay right
// whatever size it's drawn at.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface IconGridSpec {
  icon: Size;
  // Space between icons, and between the grid and the desktop's edges.
  gap: number;
  // Icons stay above the taskbar.
  taskbarHeight: number;
  // Desktop width / height, so a step across counts the same as a step down.
  aspectRatio: number;
  // Cells that overlap this area are never used (the Clock In panel sits there).
  reservedArea: Rect;
}

export interface IconGrid {
  readonly spec: IconGridSpec;
  readonly columns: number;
  readonly rows: number;
  readonly cellCount: number;
  readonly reservedCells: ReadonlySet<number>;
}

// Guards against rounding, so a grid that fits exactly doesn't lose its last cell.
const Epsilon = 1e-9;

/** How many items of `item` size fit in `space`, with `gap` between them and at both ends. */
function countFitting(space: number, item: number, gap: number): number {
  return Math.max(0, Math.floor((space - 2 * gap - item) / (item + gap) + Epsilon) + 1);
}

// Cells are numbered from 0 down each column, then across, so filling them in order lays
// icons out down the left side like a real desktop.
function positionOfCell(spec: IconGridSpec, rows: number, cell: number): Point {
  const column = Math.floor(cell / rows);
  const row = cell % rows;
  return {
    x: spec.gap + column * (spec.icon.width + spec.gap),
    y: spec.gap + row * (spec.icon.height + spec.gap),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Works out the grid: as many cells as fit with a gap all round, above the taskbar. */
export function createIconGrid(spec: IconGridSpec): IconGrid {
  const columns = countFitting(1, spec.icon.width, spec.gap);
  const rows = countFitting(1 - spec.taskbarHeight, spec.icon.height, spec.gap);
  const cellCount = columns * rows;

  const reservedCells = new Set<number>();
  for (let cell = 0; cell < cellCount; cell++) {
    const corner = positionOfCell(spec, rows, cell);
    if (overlaps({ ...corner, ...spec.icon }, spec.reservedArea)) {
      reservedCells.add(cell);
    }
  }

  return { spec, columns, rows, cellCount, reservedCells };
}

/** The top-left corner of an icon in `cell`. */
export function cellPosition(grid: IconGrid, cell: number): Point {
  return positionOfCell(grid.spec, grid.rows, cell);
}

function isFree(grid: IconGrid, cell: number, taken: ReadonlySet<number>): boolean {
  return !taken.has(cell) && !grid.reservedCells.has(cell);
}

/** The lowest-numbered cell that's neither taken nor reserved. */
export function firstFreeCell(grid: IconGrid, taken: ReadonlySet<number>): number | undefined {
  for (let cell = 0; cell < grid.cellCount; cell++) {
    if (isFree(grid, cell, taken)) {
      return cell;
    }
  }
  return undefined;
}

/** The free cell whose corner is closest to `point` (an icon's top-left corner). */
export function nearestFreeCell(
  grid: IconGrid,
  point: Point,
  taken: ReadonlySet<number>,
): number | undefined {
  let best: number | undefined;
  let bestDistance = Infinity;
  for (let cell = 0; cell < grid.cellCount; cell++) {
    if (!isFree(grid, cell, taken)) {
      continue;
    }
    const corner = cellPosition(grid, cell);
    const across = (corner.x - point.x) * grid.spec.aspectRatio;
    const down = corner.y - point.y;
    const distance = across * across + down * down;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

/** Gives each id its own cell, filling the grid in order. Throws if they don't all fit. */
export function assignIconCells<Id extends string>(
  grid: IconGrid,
  ids: readonly Id[],
): Map<Id, number> {
  const taken = new Set<number>();
  const cells = new Map<Id, number>();
  for (const id of ids) {
    const cell = firstFreeCell(grid, taken);
    if (cell === undefined) {
      throw new Error(`The desktop grid has no free cell for the "${id}" icon.`);
    }
    taken.add(cell);
    cells.set(id, cell);
  }
  return cells;
}

/**
 * Where something that started at `start` is after the pointer moved `movedPixels` on a
 * desktop `desktopPixels` big, or undefined while the desktop has no size (e.g. hidden).
 */
export function dragPosition(
  start: Point,
  movedPixels: Point,
  desktopPixels: Size,
): Point | undefined {
  if (desktopPixels.width <= 0 || desktopPixels.height <= 0) {
    return undefined;
  }
  return {
    x: start.x + movedPixels.x / desktopPixels.width,
    y: start.y + movedPixels.y / desktopPixels.height,
  };
}

/**
 * Whether the pointer has moved far enough to count as a drag rather than a click.
 * `threshold` is a fraction of the desktop's height.
 */
export function isPastDragThreshold(
  movedPixels: Point,
  threshold: number,
  desktopHeightPixels: number,
): boolean {
  return Math.hypot(movedPixels.x, movedPixels.y) >= threshold * desktopHeightPixels;
}

/** Keeps something of `size` inside the desktop and above the taskbar. */
export function clampToDesktop(position: Point, size: Size, taskbarHeight: number): Point {
  return {
    x: clamp(position.x, 0, Math.max(0, 1 - size.width)),
    y: clamp(position.y, 0, Math.max(0, 1 - taskbarHeight - size.height)),
  };
}
