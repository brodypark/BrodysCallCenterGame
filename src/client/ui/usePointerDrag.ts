// Lets the player drag something by pressing on it and moving the pointer (mouse, pen or
// finger). It moves nothing by itself: it reports how far the pointer has moved since the
// press, and the caller decides where things go (kept on screen, snapped to a grid).
// Used by windows and desktop icons. The pointer is captured, so the drag keeps going even
// when the pointer leaves the element.

import { type PointerEvent as ReactPointerEvent, useRef } from "react";

export interface PointerDragCallbacks {
  // The primary button (or a finger) was pressed on the element.
  onStart: (event: ReactPointerEvent<HTMLElement>) => void;
  // How far the pointer is from where it was pressed, in pixels.
  onMove: (movedX: number, movedY: number) => void;
  // The pointer was released, or the browser took it away (e.g. a touch became a scroll,
  // or capture was lost).
  onEnd: () => void;
}

export interface PointerDragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface ActiveDrag {
  pointerId: number;
  startX: number;
  startY: number;
}

const PrimaryButton = 0;

/** Spread the returned handlers onto the element that starts the drag. */
export function usePointerDrag(callbacks: PointerDragCallbacks): PointerDragHandlers {
  const active = useRef<ActiveDrag | null>(null);

  function end(event: ReactPointerEvent<HTMLElement>): void {
    if (active.current?.pointerId !== event.pointerId) {
      return;
    }
    active.current = null;
    callbacks.onEnd();
  }

  return {
    onPointerDown: (event) => {
      if (event.button !== PrimaryButton || active.current !== null) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
      callbacks.onStart(event);
    },
    onPointerMove: (event) => {
      const drag = active.current;
      if (drag?.pointerId !== event.pointerId) {
        return;
      }
      callbacks.onMove(event.clientX - drag.startX, event.clientY - drag.startY);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}
