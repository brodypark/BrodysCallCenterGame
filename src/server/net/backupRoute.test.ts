import { describe, expect, it } from "vitest";
import { isAuthorized } from "@server/net/backupRoute";

describe("isAuthorized", () => {
  const secret = "s".repeat(32);

  it("accepts the secret as a Bearer token", () => {
    expect(isAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("turns away a missing, wrong or differently shaped header", () => {
    expect(isAuthorized(undefined, secret)).toBe(false);
    expect(isAuthorized(`Bearer ${"t".repeat(32)}`, secret)).toBe(false);
    expect(isAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorized(secret, secret)).toBe(false);
  });
});
