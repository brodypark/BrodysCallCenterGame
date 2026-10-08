import { describe, expect, it } from "vitest";
import { isTrackerLogRequest } from "@client/facecam/blockTrackerLogs";

describe("isTrackerLogRequest", () => {
  it("spots MediaPipe's usage log, however it's asked for", () => {
    const url = "https://odml.pa.googleapis.com/v1/log";
    expect(isTrackerLogRequest(url)).toBe(true);
    expect(isTrackerLogRequest(new URL(url))).toBe(true);
    expect(isTrackerLogRequest(new Request(url, { method: "POST" }))).toBe(true);
  });

  it("lets everything else through", () => {
    expect(isTrackerLogRequest("/api/voice/3")).toBe(false);
    expect(isTrackerLogRequest("/facecam/face_landmarker.task")).toBe(false);
    expect(isTrackerLogRequest("https://example.com/odml.pa.googleapis.com")).toBe(false);
  });
});
