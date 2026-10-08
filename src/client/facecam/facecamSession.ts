// Runs the facecam while the camera is on. For each new camera frame, in one go before the
// browser paints: draw it (mirrored) on the canvas, let the tracker look at exactly that
// drawing, then draw a headset on each face it found. So the headset never lags behind the
// picture. The camera's own video element is never put on the page.

import { Config } from "@shared/Config";
import { closeCamera } from "@client/facecam/camera";
import { drawHeadset } from "@client/facecam/drawHeadset";
import type { FaceTracker } from "@client/facecam/faceTracker";
import { type HeadsetPose, headsetPose } from "@client/facecam/headsetPose";

/** What one frame showed: a headset for each face found, in pixels of the picture. */
export interface FacecamFrame {
  headsets: HeadsetPose[];
  width: number;
  height: number;
}

export type FacecamFailure = "tracking" | "camera";

// HTMLMediaElement.HAVE_CURRENT_DATA: the video has a frame to draw.
const HaveCurrentData = 2;

export interface FacecamSessionOptions {
  canvas: HTMLCanvasElement;
  // Where the camera plays, never put on the page. Made here unless given (tests give one).
  video?: HTMLVideoElement;
  stream: MediaStream;
  tracker: FaceTracker;
  onFrame: (frame: FacecamFrame) => void;
  // Tracking failed, or the camera went away. The camera is turned off.
  onFail: (failure: FacecamFailure) => void;
}

export class FacecamSession {
  private readonly options: FacecamSessionOptions;
  private readonly video: HTMLVideoElement;
  private readonly context: CanvasRenderingContext2D | null;
  private animationFrame = 0;
  private lastVideoTime = -1;
  private lastTrackTime = 0;
  private stopped = false;

  constructor(options: FacecamSessionOptions) {
    this.options = options;
    this.video = options.video ?? document.createElement("video");
    this.context = options.canvas.getContext("2d");
  }

  /** Starts showing the camera. Throws if its video won't play. */
  async start(): Promise<void> {
    const { video } = this;
    if (!this.context) {
      throw new Error("The facecam's canvas can't be drawn on.");
    }
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.options.stream;
    for (const track of this.options.stream.getVideoTracks()) {
      track.addEventListener("ended", this.onCameraEnded);
    }
    await video.play();
    if (!this.stopped) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  }

  /** Stops drawing, turns the camera off and clears the picture. Safe to call twice. */
  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    cancelAnimationFrame(this.animationFrame);
    for (const track of this.options.stream.getVideoTracks()) {
      track.removeEventListener("ended", this.onCameraEnded);
    }
    this.video.pause();
    this.video.srcObject = null;
    closeCamera(this.options.stream);
    const { canvas } = this.options;
    this.context?.clearRect(0, 0, canvas.width, canvas.height);
  }

  private readonly onCameraEnded = (): void => {
    this.fail("camera");
  };

  private fail(failure: FacecamFailure): void {
    this.stop();
    this.options.onFail(failure);
  }

  private readonly tick = (now: number): void => {
    if (this.stopped) {
      return;
    }
    this.animationFrame = requestAnimationFrame(this.tick);
    const { video } = this;
    // Only when the camera has a frame we haven't drawn yet.
    if (video.readyState < HaveCurrentData || video.currentTime === this.lastVideoTime) {
      return;
    }
    this.lastVideoTime = video.currentTime;
    this.drawFrame(now);
  };

  private drawFrame(now: number): void {
    const { canvas, tracker, onFrame } = this.options;
    const { context, video } = this;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!context || width === 0 || height === 0) {
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.save();
    if (Config.Facecam.Mirror) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    context.restore();

    let headsets: HeadsetPose[];
    try {
      // The tracker needs a later time on every call.
      const time = Math.max(now, this.lastTrackTime + 1);
      this.lastTrackTime = time;
      headsets = tracker
        .track(canvas, time)
        .map((face) => headsetPose(face, { width, height }))
        .filter((pose) => pose !== null);
    } catch {
      this.fail("tracking");
      return;
    }
    for (const headset of headsets) {
      drawHeadset(context, headset);
    }
    onFrame({ headsets, width, height });
  }
}
