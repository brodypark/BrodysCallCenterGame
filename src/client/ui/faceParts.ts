// The shapes that make up a victim's cartoon face, ported from the Roblox UI/Face. Plain
// data, so it's tested without a browser; ui/Face draws them as SVG and animates the eyes,
// brows and mouth.
//
// Everything sits in a 100 x 100 square: x from the left, y from the top, and each shape is
// placed by its center. A "rounded" shape has fully rounded ends: a circle when it's square,
// a pill when it's long.

import type { FaceLook, TrustWord } from "@shared/types";

export type Mood = "neutral" | "happy" | "angry" | "wary";
export type MouthShape = "line" | "smile" | "frown" | "smirk";

export interface BrowPose {
  y: number;
  // Degrees clockwise. For the left brow, positive tips its inner end down.
  rotation: number;
}

export interface Pose {
  left: BrowPose;
  right: BrowPose;
  mouth: MouthShape;
}

/** How each mood arranges the eyebrows and mouth. */
export const Poses: Record<Mood, Pose> = {
  neutral: { left: { y: 42, rotation: 0 }, right: { y: 42, rotation: 0 }, mouth: "line" },
  happy: { left: { y: 40, rotation: -12 }, right: { y: 40, rotation: 12 }, mouth: "smile" },
  angry: { left: { y: 44, rotation: 20 }, right: { y: 44, rotation: -20 }, mouth: "frown" },
  // One eyebrow up: not sure about you.
  wary: { left: { y: 39, rotation: -12 }, right: { y: 43, rotation: 6 }, mouth: "smirk" },
};

const MoodForWord: Record<TrustWord, Mood> = {
  trusting: "happy",
  unsure: "neutral",
  wary: "wary",
  angry: "angry",
};

/** The resting expression for how much the victim trusts the player. */
export function moodFor(word: TrustWord): Mood {
  return MoodForWord[word];
}

export const FaceColors = {
  Outline: "#141010",
  Earring: "#f5c832",
  Blush: "#ff8c96",
  MouthInside: "#7d2028",
  // The badge on a pirate hat and the stripe on a headband.
  HatTrim: "#f5f5eb",
  AntennaTip: "#ff78dc",
} as const;

// How much darker than the skin the nose is, and a hat's brim than the hat.
const NoseShade = 0.15;
const HatShade = 0.25;
const BlushOpacity = 0.6;

/** Drawing order, back to front. */
export const Layer = {
  // Antenna stalks and a tinfoil hat's point start behind the head, so only their tops show.
  BehindHead: 1,
  AntennaTips: 2,
  HairBack: 3,
  Ears: 4,
  Head: 5,
  Beard: 6,
  Details: 7,
  Eyes: 8,
  Mustache: 9,
  Glasses: 10,
  HairFront: 11,
  Hat: 12,
  HatFront: 13,
  Brows: 14,
} as const;

export const LeftEyeX = 41;
export const RightEyeX = 59;
export const EyeY = 52;
export const EyeWidth = 5.5;
export const EyeHeight = 8;
export const MouthY = 72;

export interface FacePart {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  layer: number;
  rounded: boolean;
  outlined: boolean;
  // Degrees clockwise around its center.
  rotation?: number;
  opacity?: number;
  // An outline with nothing inside (glasses lenses).
  hollow?: boolean;
}

/** `from` moved `amount` (0 to 1) of the way to `to`. Colors are like "#ffdcbe". */
export function mixColors(from: string, to: string, amount: number): string {
  const channel = (color: string, index: number): number =>
    Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
  const mixed = [0, 1, 2].map((index) => {
    const value = channel(from, index) + (channel(to, index) - channel(from, index)) * amount;
    return Math.round(value).toString(16).padStart(2, "0");
  });
  return `#${mixed.join("")}`;
}

type PartOptions = Partial<Pick<FacePart, "rotation" | "opacity" | "hollow">>;

/** Shorthand for a part: center, size, color, layer, and whether it's rounded/outlined. */
function part(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  layer: number,
  rounded: boolean,
  outlined: boolean,
  options: PartOptions = {},
): FacePart {
  return { x, y, width, height, fill, layer, rounded, outlined, ...options };
}

// Round curls along the hairline, in front of the head.
const Curls: readonly (readonly [number, number])[] = [
  [31, 25],
  [40.5, 23.5],
  [50, 23.5],
  [59.5, 23.5],
  [69, 25],
];
const CurlSize = 13;

// Hair is a puff behind the head that shows around its top and sides, plus a fringe in front.
function hair(look: FaceLook): FacePart[] {
  const { hairStyle: style, hair: color } = look;
  if (style === "Bald") {
    return [];
  }
  const parts: FacePart[] = [];
  if (style === "Bun") {
    parts.push(part(50, 12, 22, 20, color, Layer.HairBack, true, true));
  } else if (style === "Long") {
    parts.push(part(50, 58, 74, 80, color, Layer.HairBack, true, true));
  }
  const [puffWidth, puffHeight] = style === "Short" ? [64, 46] : [70, 54];
  parts.push(part(50, 38, puffWidth, puffHeight, color, Layer.HairBack, true, true));
  if (style === "Long") {
    // Straight bangs.
    parts.push(part(50, 27, 56, 16, color, Layer.HairFront, true, true));
  } else {
    const curls = style === "Short" ? Curls.slice(1, 4) : Curls;
    for (const [x, y] of curls) {
      parts.push(part(x, y, CurlSize, CurlSize, color, Layer.HairFront, true, true));
    }
  }
  return parts;
}

// A stalk on each side of the top of the head, leaning out, with a glowing ball on the end.
function antennae(skin: string): FacePart[] {
  return [-1, 1].flatMap((side) => [
    part(50 + side * 10, 14, 2.5, 18, skin, Layer.BehindHead, false, true, {
      rotation: side * 18,
    }),
    part(50 + side * 13, 5, 8, 8, FaceColors.AntennaTip, Layer.AntennaTips, true, true),
  ]);
}

// A mustache (two halves with drooping ends), and for a beard, a big oval round the chin.
function facialHair(look: FaceLook): FacePart[] {
  const parts: FacePart[] = [];
  if (look.facialHair === "Beard") {
    parts.push(part(50, 79, 52, 30, look.hair, Layer.Beard, true, true));
  }
  for (const side of [-1, 1]) {
    parts.push(
      part(50 + side * 5.5, 67, 12, 4.5, look.hair, Layer.Mustache, true, true, {
        rotation: side * 12,
      }),
    );
  }
  return parts;
}

// A patch over the left eye, its strap running up across the forehead and back to the ear.
function eyepatch(): FacePart[] {
  const color = FaceColors.Outline;
  return [
    part(LeftEyeX, EyeY, 13, 13, color, Layer.Glasses, true, false),
    part(58.5, 44, 39, 1.8, color, Layer.Glasses, false, false, { rotation: -25 }),
    part(31.5, 51, 19, 1.8, color, Layer.Glasses, false, false, { rotation: 6 }),
  ];
}

function hat(style: NonNullable<FaceLook["hat"]>["style"], color: string): FacePart[] {
  const shade = mixColors(color, FaceColors.Outline, HatShade);
  const trim = FaceColors.HatTrim;
  switch (style) {
    case "Tricorn":
      // A pirate captain's hat: a crown with a badge, and a wide brim turned up at the ends.
      return [
        part(50, 16, 46, 20, color, Layer.Hat, true, true),
        part(50, 15, 7.4, 7.2, trim, Layer.Hat, true, true),
        ...[-1, 1].map((side) =>
          part(50 + side * 36, 22, 13, 15, color, Layer.Hat, true, true, { rotation: side * 25 }),
        ),
        part(50, 27, 84, 10, color, Layer.HatFront, true, true),
      ];
    case "TinFoil":
      // A pointy foil cone: a diamond tucked behind the head so only its point shows, in a
      // crinkled band.
      return [
        part(50, 27, 36, 36, color, Layer.BehindHead, false, true, { rotation: 45 }),
        part(50, 20, 46, 8, color, Layer.Hat, true, true),
        ...[38.5, 50, 61.5].map((x) => part(x, 20, 1.4, 4.8, shade, Layer.Hat, false, false)),
      ];
    case "Deerstalker":
      // A detective's cap: a round crown with a short peak, and ear flaps tied with a bow.
      return [
        part(50, 20, 58, 24, color, Layer.Hat, true, true),
        ...[-1, 1].map((side) =>
          part(50 + side * 25, 25, 10, 12, shade, Layer.HatFront, true, true),
        ),
        part(50, 31.5, 30, 6, shade, Layer.HatFront, true, true),
        part(50, 8.5, 10, 5, shade, Layer.HatFront, true, true),
      ];
    case "Headband":
      // A sweatband with a stripe, its knot's tails hanging off the right side.
      return [
        part(80, 34, 11, 4, color, Layer.Hat, true, true, { rotation: 30 }),
        part(79, 37, 11, 4, color, Layer.Hat, true, true, { rotation: 65 }),
        part(50, 31, 52, 6.5, color, Layer.HatFront, true, true),
        part(50, 31, 47.8, 1.6, trim, Layer.HatFront, true, false),
      ];
  }
}

/** Every shape of `look`'s face except the eyes, brows and mouth (which move), back to
 * front. */
export function faceParts(look: FaceLook): FacePart[] {
  const { skin } = look;
  const parts: FacePart[] = [...hair(look)];
  if (look.antennae) {
    parts.push(...antennae(skin));
  }
  parts.push(
    part(22.5, 55, 9, 13, skin, Layer.Ears, true, true),
    part(77.5, 55, 9, 13, skin, Layer.Ears, true, true),
  );
  if (look.earrings) {
    parts.push(
      part(21.5, 64, 5.5, 5.5, FaceColors.Earring, Layer.Details, true, true),
      part(78.5, 64, 5.5, 5.5, FaceColors.Earring, Layer.Details, true, true),
    );
  }
  parts.push(part(50, 52, 56, 64, skin, Layer.Head, true, true));
  if (look.blush) {
    for (const x of [36, 64]) {
      parts.push(
        part(x, 63, 9, 5, FaceColors.Blush, Layer.Details, true, false, { opacity: BlushOpacity }),
      );
    }
  }
  parts.push(
    part(50, 61, 5, 6, mixColors(skin, FaceColors.Outline, NoseShade), Layer.Details, true, false),
  );
  if (look.glasses) {
    for (const x of [LeftEyeX, RightEyeX]) {
      parts.push(
        part(x, EyeY, 15, 15, FaceColors.Outline, Layer.Glasses, true, true, { hollow: true }),
      );
    }
    parts.push(part(50, EyeY, 4, 1.2, FaceColors.Outline, Layer.Glasses, false, false));
  }
  if (look.eyepatch) {
    parts.push(...eyepatch());
  }
  if (look.facialHair) {
    parts.push(...facialHair(look));
  }
  if (look.hat) {
    parts.push(...hat(look.hat.style, look.hat.color));
  }
  // Stable, so shapes on the same layer keep the order they were added in.
  return parts
    .map((shape, index) => ({ shape, index }))
    .sort((a, b) => a.shape.layer - b.shape.layer || a.index - b.index)
    .map(({ shape }) => shape);
}

/** Moves `value` toward `target` by at most `step`. */
export function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}
