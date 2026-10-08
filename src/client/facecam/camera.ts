// Turning the webcam on and off. The facecam is the only part of the game that ever asks
// for the camera, and only when the player turns it on. No sound is asked for.

import { Config } from "@shared/Config";

export type CameraProblem = "unsupported" | "denied" | "missing" | "busy" | "failed";

export class CameraError extends Error {
  readonly problem: CameraProblem;

  constructor(problem: CameraProblem) {
    super(`Camera problem: ${problem}`);
    this.problem = problem;
  }
}

/** What went wrong, from an error getUserMedia threw. */
export function cameraProblemFor(error: unknown): CameraProblem {
  if (error instanceof CameraError) {
    return error.problem;
  }
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "missing";
    case "NotReadableError":
    case "AbortError":
      return "busy";
    default:
      return "failed";
  }
}

/** Asks for the camera (the browser asks the player the first time). Throws a CameraError. */
export async function openCamera(): Promise<MediaStream> {
  // Missing outside a secure page (https or localhost), and in very old browsers.
  if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
    throw new CameraError("unsupported");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: Config.Facecam.VideoWidth },
        height: { ideal: Config.Facecam.VideoHeight },
      },
    });
  } catch (error) {
    throw new CameraError(cameraProblemFor(error));
  }
}

/** Turns the camera off (and its light). */
export function closeCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
