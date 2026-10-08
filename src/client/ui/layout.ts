// Desktop sizes, ported from the Roblox Theme. All are fractions of the desktop (widths of
// its width, heights of its height). The CSS reads them as variables (see layoutVars), so
// each number lives only here. Colors and fonts are in themes/themes.css.

import type { CSSProperties } from "react";
import { createIconGrid, type IconGrid, type Rect } from "@client/ui/desktopGrid";

export const DesktopLayout = {
  // Width / height. The desktop keeps this shape and letterboxes inside its container.
  AspectRatio: 16 / 9,
  TaskbarHeight: 0.055,
  // The same on every window, so title bars match.
  TitleBarHeight: 0.038,
  // Gap around a window's content, as a fraction of the desktop's width.
  ContentPadding: 0.006,
  StartMenuWidth: 0.18,
  // Tall enough for every app plus Switch save.
  StartMenuHeight: 0.34,
  Icon: {
    Width: 0.065,
    Height: 0.13,
    // Between icons, and between the icon grid and the desktop's edges.
    Gap: 0.012,
    // How far the pointer must move, as a fraction of the desktop's height, before pressing
    // an icon drags it instead of clicking it. Fingers wobble more than mice.
    DragThreshold: 0.008,
    TouchDragThreshold: 0.025,
    // How long a dropped icon takes to slide into its grid cell.
    SnapSeconds: 0.12,
  },
  // Where the Clock In panel goes between shifts (step 5). Icons never sit under it.
  ClockInArea: { x: 0.39, y: 0.32, width: 0.22, height: 0.26 } satisfies Rect,
} as const;

/** The grid every desktop icon snaps to. */
export const DesktopIconGrid: IconGrid = createIconGrid({
  icon: { width: DesktopLayout.Icon.Width, height: DesktopLayout.Icon.Height },
  gap: DesktopLayout.Icon.Gap,
  taskbarHeight: DesktopLayout.TaskbarHeight,
  aspectRatio: DesktopLayout.AspectRatio,
  reservedArea: DesktopLayout.ClockInArea,
});

/** The sizes above as CSS variables, set on the desktop's screen element. */
export const layoutVars = {
  "--desktop-aspect": DesktopLayout.AspectRatio,
  "--taskbar-height": DesktopLayout.TaskbarHeight,
  "--title-bar-height": DesktopLayout.TitleBarHeight,
  "--content-padding": DesktopLayout.ContentPadding,
  "--start-menu-width": DesktopLayout.StartMenuWidth,
  "--start-menu-height": DesktopLayout.StartMenuHeight,
  "--icon-width": DesktopLayout.Icon.Width,
  "--icon-height": DesktopLayout.Icon.Height,
  "--icon-snap-seconds": DesktopLayout.Icon.SnapSeconds,
  // React's style type has no entries for custom properties, but it passes them through.
} satisfies Record<`--${string}`, number> as CSSProperties;

/** A fraction of the desktop as a CSS percentage. */
export function percent(fraction: number): string {
  return `${fraction * 100}%`;
}
