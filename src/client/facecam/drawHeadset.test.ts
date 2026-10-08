import { describe, expect, it } from "vitest";
import { drawHeadset, type HeadsetCanvas } from "@client/facecam/drawHeadset";
import { headsetPose } from "@client/facecam/headsetPose";

describe("drawHeadset", () => {
  it("draws the band as the top half of its oval, tilted with the head", () => {
    const ellipses: number[][] = [];
    const context: HeadsetCanvas = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "butt",
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      ellipse: (x, y, radiusX, radiusY, rotation, start, end) => {
        ellipses.push([x, y, radiusX, radiusY, rotation, start, end]);
      },
      moveTo: () => undefined,
      quadraticCurveTo: () => undefined,
      stroke: () => undefined,
      fill: () => undefined,
    };
    const pose = headsetPose(
      {
        sideA: { x: 0.3, y: 0.45 },
        mouthA: { x: 0.43, y: 0.65 },
        sideB: { x: 0.7, y: 0.45 },
        mouthB: { x: 0.57, y: 0.65 },
        top: { x: 0.5, y: 0.2 },
      },
      { width: 100, height: 100 },
    );
    expect(pose).not.toBeNull();
    if (pose) {
      drawHeadset(context, pose);
    }
    // In the picture, y points down, so PI to 2 PI is the half above the center.
    expect(ellipses[0]?.slice(4)).toEqual([pose?.roll, Math.PI, 2 * Math.PI]);
  });
});
