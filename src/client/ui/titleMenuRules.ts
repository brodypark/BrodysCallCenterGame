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

/** Out of the way on shift and on the shift report; with no save picked it's always there,
 * behind the picker. */
export function isTitleMenuShown(inputs: TitleMenuInputs): boolean {
  return (
    inputs.shiftStatus === "offShift" &&
    !inputs.showingResult &&
    (inputs.activeSlot === null || inputs.titleMenuOpen)
  );
}
