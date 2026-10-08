import { describe, expect, it } from "vitest";
import { CameraError, cameraProblemFor } from "@client/facecam/camera";

describe("cameraProblemFor", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "missing"],
    ["OverconstrainedError", "missing"],
    ["NotReadableError", "busy"],
    ["AbortError", "busy"],
    ["SomethingElse", "failed"],
  ])("reads %s as %s", (name, problem) => {
    expect(cameraProblemFor(new DOMException("no", name))).toBe(problem);
  });

  it("keeps a CameraError's problem, and calls anything else a failure", () => {
    expect(cameraProblemFor(new CameraError("unsupported"))).toBe("unsupported");
    expect(cameraProblemFor("not an error")).toBe("failed");
  });
});
