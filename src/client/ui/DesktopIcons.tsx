// The app icons on the desktop. They sit on an invisible grid, filling it down the left
// side first. Dragging an icon moves it, and letting go snaps it into the nearest empty
// cell (never under the Clock In panel). A press that barely moves is a click, which opens
// the app; so does Enter or Space when the icon has keyboard focus.

import { type MouseEvent, type ReactElement, useRef, useState } from "react";
import { type AppInfo, AppList } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import {
  cellPosition,
  clampToDesktop,
  dragPosition,
  isPastDragThreshold,
  type Point,
  type Size,
} from "@client/ui/desktopGrid";
import { DesktopIconGrid, DesktopLayout, percent } from "@client/ui/layout";
import { usePointerDrag } from "@client/ui/usePointerDrag";
import styles from "@client/ui/DesktopIcons.module.css";

const IconSize: Size = { width: DesktopLayout.Icon.Width, height: DesktopLayout.Icon.Height };

interface IconPress {
  start: Point;
  // The desktop's size in pixels when the press started.
  desktop: Size;
  touch: boolean;
  // Whether the pointer has moved far enough to count as a drag rather than a click.
  dragged: boolean;
  // Where the icon was last dragged to.
  last: Point;
}

export function DesktopIcons(): ReactElement {
  const { iconCells } = useDesktopState();

  return (
    <div className={styles.layer}>
      {AppList.map((app) => {
        const cell = iconCells[app.id];
        return cell === undefined ? null : <DesktopIcon key={app.id} app={app} cell={cell} />;
      })}
    </div>
  );
}

function DesktopIcon({ app, cell }: { app: AppInfo; cell: number }): ReactElement {
  const { store, screenRef } = useDesktop();
  const [draggedTo, setDraggedTo] = useState<Point | null>(null);
  const press = useRef<IconPress | null>(null);
  // A drag ends with a click event too; this stops that click opening the app.
  const ignoreNextClick = useRef(false);
  const home = cellPosition(DesktopIconGrid, cell);

  const drag = usePointerDrag({
    onStart: (event) => {
      ignoreNextClick.current = false;
      const rect = screenRef.current?.getBoundingClientRect();
      press.current = rect
        ? {
            start: home,
            desktop: rect,
            touch: event.pointerType === "touch",
            dragged: false,
            last: home,
          }
        : null;
    },
    onMove: (movedX, movedY) => {
      const current = press.current;
      if (!current) {
        return;
      }
      const moved = { x: movedX, y: movedY };
      const threshold = current.touch
        ? DesktopLayout.Icon.TouchDragThreshold
        : DesktopLayout.Icon.DragThreshold;
      if (!current.dragged && !isPastDragThreshold(moved, threshold, current.desktop.height)) {
        return;
      }
      const next = dragPosition(current.start, moved, current.desktop);
      if (!next) {
        return;
      }
      current.dragged = true;
      current.last = clampToDesktop(next, IconSize, DesktopLayout.TaskbarHeight);
      setDraggedTo(current.last);
    },
    onEnd: () => {
      const current = press.current;
      press.current = null;
      if (!current?.dragged) {
        return;
      }
      ignoreNextClick.current = true;
      setDraggedTo(null);
      store.moveIcon(app.id, current.last);
    },
  });

  function open(event: MouseEvent<HTMLButtonElement>): void {
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      // Keyboard clicks (detail 0) always open, in case no click followed the drag.
      if (event.detail !== 0) {
        return;
      }
    }
    store.openApp(app.id);
  }

  const position = draggedTo ?? home;
  return (
    <button
      type="button"
      className={cx(styles.icon, draggedTo && styles.dragging)}
      style={{ left: percent(position.x), top: percent(position.y) }}
      onClick={open}
      {...drag}
    >
      <span className={styles.tile} style={{ backgroundColor: app.tileColor }} aria-hidden>
        {app.icon}
      </span>
      <span className={styles.label}>{app.title}</span>
    </button>
  );
}
