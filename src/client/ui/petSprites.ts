// The desktop pets' pixel art: each pose is rows of characters, one per pixel, colored by
// the pet's palette ("." is see-through). Drawn facing right; ui/DesktopPet mirrors them.
// Plain data, so a test can check every row is the same width and every color exists.

import type { VisiblePetId } from "@shared/cosmetics";

export interface Sprite {
  rows: readonly string[];
}

export interface PetArt {
  // Pixel character to color.
  palette: Readonly<Record<string, string>>;
  sitting: Sprite;
  // Two steps, swapped while walking.
  walking: readonly [Sprite, Sprite];
  napping: Sprite;
}

// The see-through pixel.
export const Clear = ".";

const CatHead = [
  "..........d...d.",
  ".........dod.dod",
  ".........doooood",
  ".........dokokod",
  "d........doopood",
  ".d.dddddddoooood",
  ".ddoooooooooood.",
  "..dooooooooooood",
  "..doooooooooood.",
  "..ddddddddddddd.",
];
const CatAsleep = [
  "..........d...d.",
  ".........dod.dod",
  ".........doooood",
  ".........dddoddd",
  "d........doopood",
  ".d.dddddddoooood",
  ".ddoooooooooood.",
  "..dooooooooooood",
  "..doooooooooood.",
  "..ddddddddddddd.",
];

const RockBody = [
  "....dddd....",
  "..ddgggldd..",
  ".dggwkgwkgd.",
  ".dgggggggggd",
  "dggggggggggd",
  "dggggggggggd",
  ".dddddddddd.",
];

const BuddyTop = [
  "......yy......",
  ".....rrrr.....",
  "....rrrrrr....",
  "...dvvvvvvd...",
  "..dvvvvvvvvd..",
  "..dvwwvvwwvd..",
  "..dvwkvvwkvd..",
];
const BuddyBottom = ["...dvvvvvvd...", "....dvvvvd....", ".....dddd....."];

export const PetSprites: Record<VisiblePetId, PetArt> = {
  pixelCat: {
    palette: { d: "#3b2414", o: "#f2a03d", k: "#1a1a1a", p: "#ff8fb1" },
    sitting: { rows: [...CatHead, "...dd.dd..dd.dd.", "...dd.dd..dd.dd."] },
    walking: [
      { rows: [...CatHead, "...dd.dd..dd.dd.", "...dd.dd..dd.dd."] },
      { rows: [...CatHead, "..dd...dd.dd..dd", ".dd....dd..dd..."] },
    ],
    napping: { rows: ["................", "................", ...CatAsleep] },
  },
  petRock: {
    palette: { d: "#3a3a3a", g: "#8a8a8a", l: "#c4c4c4", w: "#ffffff", k: "#111111" },
    sitting: { rows: RockBody },
    walking: [{ rows: RockBody }, { rows: RockBody }],
    napping: { rows: RockBody },
  },
  deskBuddy: {
    palette: {
      y: "#ffd23f",
      r: "#e63946",
      d: "#3d1a5c",
      v: "#8e44d6",
      w: "#ffffff",
      k: "#111111",
      p: "#ff8fb1",
    },
    sitting: {
      rows: [...BuddyTop, ".ddvvvvvvvvdd.", "dvdvvppppvvdvd", "dv.dvvvvvvd.vd", ...BuddyBottom],
    },
    walking: [
      {
        rows: [...BuddyTop, ".ddvvvvvvvvdd.", "dvdvvppppvvdvd", "dv.dvvvvvvd.vd", ...BuddyBottom],
      },
      {
        rows: [...BuddyTop, "vddvvvvvvvvddv", ".dvvvppppvvvd.", ".dvdvvvvvvdvd.", ...BuddyBottom],
      },
    ],
    napping: {
      rows: [...BuddyTop, ".ddvvvvvvvvdd.", "dvdvvppppvvdvd", "dv.dvvvvvvd.vd", ...BuddyBottom],
    },
  },
};

/** One row of a sprite as runs of the same color, so it draws with few rectangles. */
export function rowRuns(row: string): { start: number; length: number; pixel: string }[] {
  const runs: { start: number; length: number; pixel: string }[] = [];
  for (let index = 0; index < row.length; index += 1) {
    const pixel = row.charAt(index);
    const last = runs.at(-1);
    if (last && last.pixel === pixel && last.start + last.length === index) {
      last.length += 1;
    } else if (pixel !== Clear) {
      runs.push({ start: index, length: 1, pixel });
    }
  }
  return runs;
}
