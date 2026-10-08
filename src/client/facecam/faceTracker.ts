// Finds faces in camera frames with MediaPipe's Face Landmarker, on the player's device.
// Its code, WebAssembly and model are served from public/facecam (not a CDN) and only load
// when the facecam is turned on, the first time.

import type { FaceLandmarkerOptions, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { Config } from "@shared/Config";
import { blockTrackerLogs } from "@client/facecam/blockTrackerLogs";
import type { Point, TrackedFace } from "@client/facecam/headsetPose";

const WasmFolder = "/facecam/wasm";
const ModelFile = "/facecam/face_landmarker.task";
// Points in MediaPipe's face mesh: each side of the face at ear level with the mouth corner
// on that side, and the top of the forehead.
const MeshPoints = { sideA: 234, mouthA: 61, sideB: 454, mouthB: 291, top: 10 } as const;

export interface FaceTracker {
  /** The faces in `frame`. `timeMs` must go up with every call. Throws if tracking fails. */
  track: (frame: HTMLCanvasElement, timeMs: number) => TrackedFace[];
  close: () => void;
}

/** The faces in a MediaPipe result, in the shape headsetPose needs. A face missing any of
 * the points is left out (it just gets no headset). */
export function trackedFaces(result: FaceLandmarkerResult): TrackedFace[] {
  const faces: TrackedFace[] = [];
  for (const points of result.faceLandmarks) {
    const pick = (index: number): Point | null => {
      const point = points[index];
      return point ? { x: point.x, y: point.y } : null;
    };
    const sideA = pick(MeshPoints.sideA);
    const mouthA = pick(MeshPoints.mouthA);
    const sideB = pick(MeshPoints.sideB);
    const mouthB = pick(MeshPoints.mouthB);
    const top = pick(MeshPoints.top);
    if (sideA && mouthA && sideB && mouthB && top) {
      faces.push({ sideA, mouthA, sideB, mouthB, top });
    }
  }
  return faces;
}

function optionsFor(delegate: "GPU" | "CPU"): FaceLandmarkerOptions {
  const { MaxFaces, MinConfidence } = Config.Facecam;
  return {
    baseOptions: { modelAssetPath: ModelFile, delegate },
    runningMode: "VIDEO",
    numFaces: MaxFaces,
    minFaceDetectionConfidence: MinConfidence,
    minFacePresenceConfidence: MinConfidence,
    minTrackingConfidence: MinConfidence,
  };
}

/** Loads the tracker, on the graphics card if it can and the processor if not. Throws if it
 * can't run in this browser. */
export async function loadFaceTracker(): Promise<FaceTracker> {
  blockTrackerLogs();
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WasmFolder);
  let landmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(files, optionsFor("GPU"));
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(files, optionsFor("CPU"));
  }
  return {
    track: (frame, timeMs) => trackedFaces(landmarker.detectForVideo(frame, timeMs)),
    close: () => landmarker.close(),
  };
}
