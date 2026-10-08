import type { FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { trackedFaces } from "@client/facecam/faceTracker";

const PointCount = 478;

/** A face mesh with every point at the middle, except the ones in `points`. */
function mesh(points: Record<number, [number, number]>, count = PointCount): NormalizedLandmark[] {
  return Array.from({ length: count }, (_, index) => {
    const [x, y] = points[index] ?? [0.5, 0.5];
    return { x, y, z: 0, visibility: 1 };
  });
}

function result(faces: NormalizedLandmark[][]): FaceLandmarkerResult {
  return { faceLandmarks: faces, faceBlendshapes: [], facialTransformationMatrixes: [] };
}

describe("trackedFaces", () => {
  it("picks out the sides of the face, the mouth corners and the forehead", () => {
    const [face] = trackedFaces(
      result([
        mesh({
          234: [0.3, 0.45],
          61: [0.42, 0.65],
          454: [0.7, 0.46],
          291: [0.58, 0.66],
          10: [0.5, 0.2],
        }),
      ]),
    );
    expect(face).toEqual({
      sideA: { x: 0.3, y: 0.45 },
      mouthA: { x: 0.42, y: 0.65 },
      sideB: { x: 0.7, y: 0.46 },
      mouthB: { x: 0.58, y: 0.66 },
      top: { x: 0.5, y: 0.2 },
    });
  });

  it("leaves out a face missing its points", () => {
    expect(trackedFaces(result([mesh({}), mesh({}, 100)]))).toHaveLength(1);
  });

  it("finds every face, and none in an empty picture", () => {
    expect(trackedFaces(result([mesh({}), mesh({})]))).toHaveLength(2);
    expect(trackedFaces(result([]))).toEqual([]);
  });
});
