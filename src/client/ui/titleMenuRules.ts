// When the title menu covers the desktop. Plain TypeScript, so it's unit tested.

import type { ShiftStatus } from "@shared/types";

export interface TitleMenuInputs {
  shiftStatus: ShiftStatus;
  // The last shift's report is up.
  showingResult: boolean;
  activeSlot: number | null;
  // The player hasn't gone to the desk (desktopStore.titleMenuOpen).
  titleMenuOpen: boolean;
}

export function isTitleMenuShown(inputs: TitleMenuInputs): boolean {
  return inputs.activeSlot === null;
}
