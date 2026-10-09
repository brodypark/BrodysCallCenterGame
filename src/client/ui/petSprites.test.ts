import { describe, expect, it } from "vitest";
import { PetIds } from "@shared/cosmetics";
import { Config } from "@shared/Config";
import { Clear, PetSprites, rowRuns } from "@client/ui/petSprites";

describe("petSprites", () => {
  const pets = Object.entries(PetSprites);

  it("has art and a behavior for every pet but No Pet", () => {
    expect(Object.keys(PetSprites).sort()).toEqual(PetIds.filter((id) => id !== "noPet").sort());
    expect(Object.keys(Config.Pets.Behaviors).sort()).toEqual(Object.keys(PetSprites).sort());
  });

  it.each(pets)("draws %s with even rows and only its own colors", (_id, art) => {
    for (const sprite of [art.sitting, art.napping, ...art.walking]) {
      const width = sprite.rows[0]?.length ?? 0;
      expect(width).toBeGreaterThan(0);
      for (const row of sprite.rows) {
        expect(row).toHaveLength(width);
        for (const pixel of row) {
          if (pixel !== Clear) {
            expect(art.palette[pixel]).toBeDefined();
          }
        }
      }
    }
  });

  it("joins neighboring pixels of one color and skips see-through ones", () => {
    expect(rowRuns("..aab.a")).toEqual([
      { start: 2, length: 2, pixel: "a" },
      { start: 4, length: 1, pixel: "b" },
      { start: 6, length: 1, pixel: "a" },
    ]);
  });
});
