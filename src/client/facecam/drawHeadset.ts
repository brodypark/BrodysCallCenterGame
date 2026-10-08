// Draws a call-center headset on the facecam's canvas, from a HeadsetPose.

import type { HeadsetPose, Point } from "@client/facecam/headsetPose";

export const HeadsetColors = {
  Band: "#3a3d46",
  Cup: "#24262c",
  // The ring round each ear cup.
  Trim: "#6d7280",
  Mic: "#141518",
} as const;

// The ring is this share of the cup's size, and this share of the band's thickness.
const TrimSize = 0.6;
const TrimWidth = 0.4;
const FullTurn = 2 * Math.PI;

/** The 2D canvas calls the headset uses (so tests can record them). */
export type HeadsetCanvas = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "ellipse"
  | "moveTo"
  | "quadraticCurveTo"
  | "stroke"
  | "fill"
  | "strokeStyle"
  | "fillStyle"
  | "lineWidth"
  | "lineCap"
>;

function oval(
  context: HeadsetCanvas,
  center: Point,
  width: number,
  height: number,
  roll: number,
): void {
  context.beginPath();
  context.ellipse(center.x, center.y, width / 2, height / 2, roll, 0, FullTurn);
}

export function drawHeadset(context: HeadsetCanvas, pose: HeadsetPose): void {
  const { roll } = pose;
  context.save();
  context.lineCap = "round";

  // The band over the top of the head: the upper half of the oval.
  context.strokeStyle = HeadsetColors.Band;
  context.lineWidth = pose.bandWidth;
  context.beginPath();
  context.ellipse(
    pose.bandCenter.x,
    pose.bandCenter.y,
    pose.bandRadiusX,
    pose.bandRadiusY,
    roll,
    Math.PI,
    FullTurn,
  );
  context.stroke();

  // The boom, out from under the left cup to the mouth.
  context.lineWidth = pose.boomWidth;
  context.beginPath();
  context.moveTo(pose.boomStart.x, pose.boomStart.y);
  context.quadraticCurveTo(pose.boomBend.x, pose.boomBend.y, pose.boomEnd.x, pose.boomEnd.y);
  context.stroke();

  for (const cup of [pose.leftCup, pose.rightCup]) {
    context.fillStyle = HeadsetColors.Cup;
    oval(context, cup, pose.cupWidth, pose.cupHeight, roll);
    context.fill();
    context.strokeStyle = HeadsetColors.Trim;
    context.lineWidth = pose.bandWidth * TrimWidth;
    oval(context, cup, pose.cupWidth * TrimSize, pose.cupHeight * TrimSize, roll);
    context.stroke();
  }

  context.fillStyle = HeadsetColors.Mic;
  oval(context, pose.boomEnd, pose.micWidth, pose.micHeight, roll);
  context.fill();
  context.restore();
}
