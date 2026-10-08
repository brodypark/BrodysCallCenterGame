// Where to draw a call-center headset on a face the tracker found: a band over the top of
// the head, a cup on each ear, and a boom from one cup to a mic beside the mouth. Plain
// math, so it's tested without a camera.

export interface Point {
  x: number;
  y: number;
}

/** The points of one face the headset hangs on, from 0 to 1 across the picture as shown.
 * Each side of the face (at ear level) is paired with the mouth corner on the same side. */
export interface TrackedFace {
  sideA: Point;
  mouthA: Point;
  sideB: Point;
  mouthB: Point;
  // The top of the forehead.
  top: Point;
}

/** How to draw the headset, in pixels of the picture. */
export interface HeadsetPose {
  // The face's width at the ears; everything else is sized from it.
  headWidth: number;
  // The tilt of the line between the ears, in radians clockwise.
  roll: number;
  // The ear cups' centers, the one on the left of the picture first.
  leftCup: Point;
  rightCup: Point;
  cupWidth: number;
  cupHeight: number;
  // The band: the top half of an oval through both cups.
  bandCenter: Point;
  bandRadiusX: number;
  bandRadiusY: number;
  bandWidth: number;
  // The boom: a curve from the left cup, sagging a little, to the mic beside the mouth.
  boomStart: Point;
  boomBend: Point;
  boomEnd: Point;
  boomWidth: number;
  micWidth: number;
  micHeight: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

// The headset's shape, as fractions of the face's width at the ears.
const Shape = {
  // Cups sit this far out from the face's edge, and this far down from it.
  CupOut: 0.03,
  CupDown: 0.05,
  CupWidth: 0.17,
  CupHeight: 0.3,
  BandWidth: 0.055,
  // The band clears the forehead by this much, as a multiple of the ears-to-forehead height
  // (never taken as less than MinBandHeight), to go over the hair.
  BandOverTop: 1.4,
  MinBandHeight: 0.3,
  // The boom leaves the bottom of the cup and ends this far out from the mouth's corner.
  BoomFromCup: 0.1,
  MicOut: 0.07,
  BoomSag: 0.12,
  BoomWidth: 0.028,
  MicWidth: 0.1,
  MicHeight: 0.07,
} as const;

function toPixels(point: Point, frame: FrameSize): Point {
  return { x: point.x * frame.width, y: point.y * frame.height };
}

function add(a: Point, b: Point, scale = 1): Point {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** How to draw a headset on `face`, in a picture of `frame`'s size, or null if the face is
 * too squashed to draw on. */
export function headsetPose(face: TrackedFace, frame: FrameSize): HeadsetPose | null {
  // The side on the head's left as seen in the picture first, each with its mouth corner:
  // the one that puts the forehead above the line between the ears, at any tilt.
  const fromA = { x: face.sideB.x - face.sideA.x, y: face.sideB.y - face.sideA.y };
  const toTop = { x: face.top.x - face.sideA.x, y: face.top.y - face.sideA.y };
  const aIsLeft = fromA.x * toTop.y - fromA.y * toTop.x <= 0;
  const [left, mouthLeft, right] = aIsLeft
    ? [face.sideA, face.mouthA, face.sideB]
    : [face.sideB, face.mouthB, face.sideA];
  const leftSide = toPixels(left, frame);
  const rightSide = toPixels(right, frame);
  const mouth = toPixels(mouthLeft, frame);
  const top = toPixels(face.top, frame);

  const headWidth = Math.hypot(rightSide.x - leftSide.x, rightSide.y - leftSide.y);
  if (!Number.isFinite(headWidth) || headWidth === 0) {
    return null;
  }
  // Along the line from ear to ear, and square to it, pointing down the face.
  const across = {
    x: (rightSide.x - leftSide.x) / headWidth,
    y: (rightSide.y - leftSide.y) / headWidth,
  };
  const down = { x: -across.y, y: across.x };
  const size = (fraction: number): number => fraction * headWidth;

  const leftCup = add(add(leftSide, across, -size(Shape.CupOut)), down, size(Shape.CupDown));
  const rightCup = add(add(rightSide, across, size(Shape.CupOut)), down, size(Shape.CupDown));
  const bandCenter = midpoint(leftCup, rightCup);
  // How far the forehead is above the line between the cups.
  const foreheadHeight = -((top.x - bandCenter.x) * down.x + (top.y - bandCenter.y) * down.y);

  const boomStart = add(leftCup, down, size(Shape.BoomFromCup));
  const boomEnd = add(mouth, across, -size(Shape.MicOut));
  const boomBend = add(midpoint(boomStart, boomEnd), down, size(Shape.BoomSag));

  return {
    headWidth,
    roll: Math.atan2(across.y, across.x),
    leftCup,
    rightCup,
    cupWidth: size(Shape.CupWidth),
    cupHeight: size(Shape.CupHeight),
    bandCenter,
    bandRadiusX: Math.hypot(rightCup.x - leftCup.x, rightCup.y - leftCup.y) / 2,
    bandRadiusY: Math.max(foreheadHeight, size(Shape.MinBandHeight)) * Shape.BandOverTop,
    bandWidth: size(Shape.BandWidth),
    boomStart,
    boomBend,
    boomEnd,
    boomWidth: size(Shape.BoomWidth),
    micWidth: size(Shape.MicWidth),
    micHeight: size(Shape.MicHeight),
  };
}
