import { describe, expect, it } from "vitest";
import { headsetPose, type TrackedFace } from "@client/facecam/headsetPose";

const Frame = { width: 100, height: 100 };

// A level face 40 pixels wide at the ears, forehead 25 above them.
const face: TrackedFace = {
  sideA: { x: 0.3, y: 0.45 },
  mouthA: { x: 0.43, y: 0.65 },
  sideB: { x: 0.7, y: 0.45 },
  mouthB: { x: 0.57, y: 0.65 },
  top: { x: 0.5, y: 0.2 },
};

describe("headsetPose", () => {
  it("puts a cup just outside each side of the face", () => {
    const pose = headsetPose(face, Frame);
    expect(pose?.headWidth).toBeCloseTo(40);
    expect(pose?.roll).toBeCloseTo(0);
    expect(pose?.leftCup.x).toBeLessThan(30);
    expect(pose?.rightCup.x).toBeGreaterThan(70);
  });

  it("arches the band over the forehead", () => {
    const pose = headsetPose(face, Frame);
    const bandTop = (pose?.bandCenter.y ?? 0) - (pose?.bandRadiusY ?? 0);
    expect(bandTop).toBeLessThan(20);
  });

  it("ends the mic just outside the mouth corner on the left", () => {
    const pose = headsetPose(face, Frame);
    expect(pose?.boomEnd.x).toBeLessThan(43);
    expect(pose?.boomEnd.x).toBeGreaterThan(pose?.leftCup.x ?? 0);
    expect(pose?.boomEnd.y).toBeCloseTo(65);
  });

  it("works out left and right from the picture, not the mesh", () => {
    const swapped: TrackedFace = {
      sideA: face.sideB,
      mouthA: face.mouthB,
      sideB: face.sideA,
      mouthB: face.mouthA,
      top: face.top,
    };
    expect(headsetPose(swapped, Frame)).toEqual(headsetPose(face, Frame));
  });

  it("tilts with the head", () => {
    const tilted: TrackedFace = {
      ...face,
      sideA: { x: 0.3, y: 0.4 },
      sideB: { x: 0.7, y: 0.8 },
    };
    expect(headsetPose(tilted, Frame)?.roll).toBeCloseTo(Math.PI / 4);
  });

  it("keeps the band over the head even upside down", () => {
    const upsideDown: TrackedFace = {
      sideA: { x: 0.7, y: 0.55 },
      mouthA: { x: 0.57, y: 0.35 },
      sideB: { x: 0.3, y: 0.55 },
      mouthB: { x: 0.43, y: 0.35 },
      top: { x: 0.5, y: 0.8 },
    };
    const pose = headsetPose(upsideDown, Frame);
    expect(pose?.roll).toBeCloseTo(Math.PI);
    // The band's top (the oval's far side from the mouth) is below the ears, past the forehead.
    expect((pose?.bandCenter.y ?? 0) + (pose?.bandRadiusY ?? 0)).toBeGreaterThan(80);
  });

  it("gives up on a face with no width", () => {
    expect(headsetPose({ ...face, sideB: face.sideA }, Frame)).toBeNull();
  });
});
