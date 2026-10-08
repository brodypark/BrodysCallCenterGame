import { describe, expect, it } from "vitest";
import { isTitleMenuShown, type TitleMenuInputs } from "@client/ui/titleMenuRules";

const base: TitleMenuInputs = {
  shiftStatus: "offShift",
  showingResult: false,
  activeSlot: 1,
  titleMenuOpen: true,
};

describe("isTitleMenuShown", () => {
  it("shows between shifts until the player goes to the desk", () => {
    expect(isTitleMenuShown(base)).toBe(true);
    expect(isTitleMenuShown({ ...base, titleMenuOpen: false })).toBe(false);
  });

  it("always shows behind the save picker", () => {
    expect(isTitleMenuShown({ ...base, activeSlot: null, titleMenuOpen: false })).toBe(true);
  });

  it("hides on shift and while the shift report is up", () => {
    expect(isTitleMenuShown({ ...base, shiftStatus: "onShift" })).toBe(false);
    expect(isTitleMenuShown({ ...base, shiftStatus: "overtime" })).toBe(false);
    expect(isTitleMenuShown({ ...base, showingResult: true })).toBe(false);
  });
});
