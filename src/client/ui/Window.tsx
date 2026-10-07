// A retro window: raised bevel, a title bar with a close button, and the app inside.
// Pressing anywhere on it brings it to the front, and dragging the title bar moves it
// around the desktop (kept inside it and above the taskbar).

import { type ReactElement, type ReactNode, useRef } from "react";
import type { AppInfo } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { useDesktop } from "@client/ui/DesktopContext";
import { dragPosition, type Point, type Size } from "@client/ui/desktopGrid";
import { percent } from "@client/ui/layout";
import { usePointerDrag } from "@client/ui/usePointerDrag";
import styles from "@client/ui/Window.module.css";

interface WindowProps {
  app: AppInfo;
  position: Point;
  // 0 is the back; higher draws in front.
  stackIndex: number;
  focused: boolean;
  children: ReactNode;
}

interface WindowDrag {
  start: Point;
  // The desktop's size in pixels when the drag started.
  desktop: Size;
}

export function Window({
  app,
  position,
  stackIndex,
  focused,
  children,
}: WindowProps): ReactElement {
  const { store, screenRef } = useDesktop();
  const drag = useRef<WindowDrag | null>(null);

  const titleBarDrag = usePointerDrag({
    onStart: () => {
      const rect = screenRef.current?.getBoundingClientRect();
      drag.current = rect ? { start: position, desktop: rect } : null;
      store.focusApp(app.id);
    },
    onMove: (movedX, movedY) => {
      const current = drag.current;
      const next =
        current && dragPosition(current.start, { x: movedX, y: movedY }, current.desktop);
      if (next) {
        store.moveWindow(app.id, next);
      }
    },
    onEnd: () => {
      drag.current = null;
    },
  });

  return (
    <section
      className={cx(controls.raised, styles.window, focused && styles.focused)}
      style={{
        left: percent(position.x),
        top: percent(position.y),
        width: percent(app.layout.width),
        height: percent(app.layout.height),
        zIndex: stackIndex + 1,
      }}
      aria-label={app.title}
      onPointerDownCapture={() => store.focusApp(app.id)}
    >
      <header className={styles.titleBar} {...titleBarDrag}>
        <span className={styles.title}>
          {app.icon} {app.title}
        </span>
        <button
          type="button"
          className={cx(controls.button, styles.close)}
          aria-label={`Close ${app.title}`}
          // Pressing the close button mustn't start a drag of the title bar.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => store.closeApp(app.id)}
        >
          X
        </button>
      </header>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
