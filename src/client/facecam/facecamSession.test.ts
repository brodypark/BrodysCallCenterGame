import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FacecamFrame, FacecamSession } from "@client/facecam/facecamSession";
import type { FaceTracker } from "@client/facecam/faceTracker";
import type { TrackedFace } from "@client/facecam/headsetPose";

const Width = 64;
const Height = 48;

const face: TrackedFace = {
  sideA: { x: 0.3, y: 0.45 },
  mouthA: { x: 0.43, y: 0.65 },
  sideB: { x: 0.7, y: 0.45 },
  mouthB: { x: 0.57, y: 0.65 },
  top: { x: 0.5, y: 0.2 },
};

/** A session on fake browser parts. `track` stands in for the tracker. */
function setup(track: () => TrackedFace[]) {
  // What was drawn, in order.
  const drawn: string[] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    save: () => drawn.push("save"),
    restore: () => drawn.push("restore"),
    translate: () => undefined,
    scale: () => undefined,
    drawImage: () => drawn.push("camera"),
    clearRect: () => drawn.push("clear"),
    beginPath: () => undefined,
    ellipse: () => undefined,
    moveTo: () => undefined,
    quadraticCurveTo: () => undefined,
    stroke: () => drawn.push("headset"),
    fill: () => drawn.push("headset"),
  };
  const canvas = { width: 0, height: 0, getContext: () => context };
  const cameraTrack = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const stream = { getTracks: () => [cameraTrack], getVideoTracks: () => [cameraTrack] };
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null as unknown,
    readyState: 4,
    currentTime: 0,
    videoWidth: Width,
    videoHeight: Height,
    play: () => Promise.resolve(),
    pause: () => undefined,
  };
  const tracker: FaceTracker = { track, close: () => undefined };
  const frames: FacecamFrame[] = [];
  const onFail = vi.fn();
  const session = new FacecamSession({
    // Fakes with only the parts the session uses.
    canvas: canvas as unknown as HTMLCanvasElement,
    video: video as unknown as HTMLVideoElement,
    stream: stream as unknown as MediaStream,
    tracker,
    onFrame: (frame) => frames.push(frame),
    onFail,
  });
  return { session, drawn, cameraTrack, video, frames, onFail };
}

let nextFrame: FrameRequestCallback | null = null;

/** Runs the next animation frame, with a new camera frame ready. */
function runFrame(video: { currentTime: number }): void {
  video.currentTime += 1;
  const callback = nextFrame;
  nextFrame = null;
  callback?.(performance.now());
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    nextFrame = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FacecamSession", () => {
  it("draws a headset on each face right after the camera frame", async () => {
    const { session, drawn, video, frames } = setup(() => [face, face]);
    await session.start();
    runFrame(video);
    expect(drawn.slice(0, 3)).toEqual(["save", "camera", "restore"]);
    expect(drawn.slice(3).filter((step) => step === "headset").length).toBeGreaterThan(0);
    expect(frames.at(-1)?.headsets).toHaveLength(2);
  });

  it("shows just the camera when no face is found", async () => {
    const { session, drawn, video, frames } = setup(() => []);
    await session.start();
    runFrame(video);
    expect(drawn).toEqual(["save", "camera", "restore"]);
    expect(frames.at(-1)?.headsets).toEqual([]);
  });

  it("turns the camera off when tracking fails", async () => {
    const { session, video, cameraTrack, onFail } = setup(() => {
      throw new Error("tracking broke");
    });
    await session.start();
    runFrame(video);
    expect(onFail).toHaveBeenCalledWith("tracking");
    expect(cameraTrack.stop).toHaveBeenCalled();
    expect(nextFrame).toBeNull();
  });

  it("doesn't draw a camera frame it has already drawn", async () => {
    const { session, drawn, video } = setup(() => [face]);
    await session.start();
    runFrame(video);
    drawn.length = 0;
    nextFrame?.(performance.now());
    expect(drawn).toEqual([]);
  });

  it("turns the camera off and clears the picture when stopped", async () => {
    const { session, drawn, video, cameraTrack } = setup(() => [face]);
    await session.start();
    runFrame(video);
    drawn.length = 0;
    session.stop();
    expect(cameraTrack.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(drawn).toEqual(["clear"]);
    expect(nextFrame).toBeNull();
  });
});
