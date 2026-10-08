import { describe, expect, it } from "vitest";
import type { FaceLook } from "@shared/types";
import { approach, FaceColors, faceParts, Layer, mixColors, moodFor } from "@client/ui/faceParts";

const grandma: FaceLook = {
  skin: "#ffdcbe",
  hair: "#d7d7dc",
  hairStyle: "Bun",
  glasses: true,
  earrings: true,
  blush: true,
};

const bald: FaceLook = {
  skin: "#c08060",
  hair: "#222222",
  hairStyle: "Bald",
  glasses: false,
  earrings: false,
  blush: false,
};

describe("moodFor", () => {
  it("smiles when trusting and scowls when angry", () => {
    expect(moodFor("trusting")).toBe("happy");
    expect(moodFor("unsure")).toBe("neutral");
    expect(moodFor("wary")).toBe("wary");
    expect(moodFor("angry")).toBe("angry");
  });
});

describe("mixColors", () => {
  it("moves one color toward another", () => {
    expect(mixColors("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColors("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColors("#ff0000", "#0000ff", 0.25)).toBe("#bf0040");
  });
});

describe("faceParts", () => {
  it("draws back to front", () => {
    const layers = faceParts(grandma).map((part) => part.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
  });

  it("draws the look's extras and leaves out the rest", () => {
    const fills = (look: FaceLook): string[] => faceParts(look).map((part) => part.fill);
    expect(fills(grandma)).toContain(FaceColors.Earring);
    expect(fills(grandma)).toContain(FaceColors.Blush);
    expect(faceParts(grandma).some((part) => part.hollow)).toBe(true);

    expect(fills(bald)).not.toContain(FaceColors.Earring);
    expect(fills(bald)).not.toContain(bald.hair);
    expect(faceParts(bald).some((part) => part.hollow)).toBe(false);
  });

  it("adds hats, beards, eyepatches and antennae", () => {
    const pirate: FaceLook = {
      ...bald,
      hat: { style: "Tricorn", color: "#202020" },
      facialHair: "Beard",
      eyepatch: true,
      antennae: true,
    };
    const parts = faceParts(pirate);
    expect(parts.filter((part) => part.layer === Layer.HatFront)).not.toHaveLength(0);
    expect(parts.filter((part) => part.layer === Layer.Beard)).toHaveLength(1);
    expect(parts.filter((part) => part.layer === Layer.Mustache)).toHaveLength(2);
    expect(parts.filter((part) => part.fill === FaceColors.AntennaTip)).toHaveLength(2);
    expect(parts.length).toBeGreaterThan(faceParts(bald).length);
  });

  it("has a shape for every hat style", () => {
    for (const style of ["Tricorn", "TinFoil", "Deerstalker", "Headband"] as const) {
      const hatted = faceParts({ ...bald, hat: { style, color: "#808080" } });
      expect(hatted.length).toBeGreaterThan(faceParts(bald).length);
    }
  });
});

describe("approach", () => {
  it("moves toward the target without passing it", () => {
    expect(approach(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(approach(0.9, 1, 0.3)).toBe(1);
    expect(approach(1, 0, 0.3)).toBeCloseTo(0.7);
    expect(approach(0.1, 0, 0.3)).toBe(0);
  });
});
