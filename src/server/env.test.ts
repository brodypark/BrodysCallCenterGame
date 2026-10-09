import { describe, expect, it } from "vitest";
import { ServerConfig } from "@server/config";
import { parsePort, readServerEnv } from "@server/env";

describe("parsePort", () => {
  it("uses the fallback when PORT is unset or blank", () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(parsePort("  ", 3000)).toBe(3000);
  });

  it("reads a valid port", () => {
    expect(parsePort("8080", 3000)).toBe(8080);
  });

  it("rejects ports that are not whole numbers in range", () => {
    expect(() => parsePort("abc", 3000)).toThrow();
    expect(() => parsePort("0", 3000)).toThrow();
    expect(() => parsePort("70000", 3000)).toThrow();
    expect(() => parsePort("80.5", 3000)).toThrow();
  });
});

describe("readServerEnv", () => {
  it("falls back to defaults and treats blank keys as missing", () => {
    const env = readServerEnv({ GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "   " });
    expect(env).toEqual({
      port: ServerConfig.DefaultPort,
      host: ServerConfig.DefaultHost,
      isProduction: false,
      cookieSecret: ServerConfig.PlayerCookie.DevSecret,
      usingDevCookieSecret: true,
      shiftSecondsOverride: undefined,
      geminiApiKey: undefined,
      geminiBackupApiKey: undefined,
      elevenLabsApiKey: undefined,
    });
  });

  it("reads production mode and keys", () => {
    const secret = "s".repeat(ServerConfig.PlayerCookie.MinSecretLength);
    const env = readServerEnv({
      NODE_ENV: "production",
      PORT: "4000",
      COOKIE_SECRET: secret,
      GEMINI_API_KEY: "gemini-test",
      GEMINI_API_KEY_BACKUP: "gemini-backup",
      ELEVENLABS_API_KEY: "eleven-test",
    });
    expect(env.isProduction).toBe(true);
    expect(env.port).toBe(4000);
    expect(env.host).toBe(ServerConfig.DefaultProductionHost);
    expect(env.cookieSecret).toBe(secret);
    expect(env.usingDevCookieSecret).toBe(false);
    expect(env.geminiApiKey).toBe("gemini-test");
    expect(env.geminiBackupApiKey).toBe("gemini-backup");
    expect(env.elevenLabsApiKey).toBe("eleven-test");
  });

  it("refuses to run production without a long enough cookie secret", () => {
    expect(() => readServerEnv({ NODE_ENV: "production" })).toThrow(/COOKIE_SECRET/);
    expect(() => readServerEnv({ NODE_ENV: "production", COOKIE_SECRET: "short" })).toThrow(
      /COOKIE_SECRET/,
    );
  });

  it("refuses to run production with a short admin secret, but allows none", () => {
    const secret = "s".repeat(ServerConfig.PlayerCookie.MinSecretLength);
    expect(() =>
      readServerEnv({ NODE_ENV: "production", COOKIE_SECRET: secret, ADMIN_SECRET: "admin" }),
    ).toThrow(/ADMIN_SECRET/);
    expect(
      readServerEnv({ NODE_ENV: "production", COOKIE_SECRET: secret, ADMIN_SECRET: secret })
        .adminSecret,
    ).toBe(secret);
    expect(
      readServerEnv({ NODE_ENV: "production", COOKIE_SECRET: secret }).adminSecret,
    ).toBeUndefined();
  });

  it("takes a shorter shift for testing, but never in production", () => {
    expect(readServerEnv({ SHIFT_SECONDS: "60" }).shiftSecondsOverride).toBe(60);
    expect(() => readServerEnv({ SHIFT_SECONDS: "soon" })).toThrow(/SHIFT_SECONDS/);
    const secret = "s".repeat(ServerConfig.PlayerCookie.MinSecretLength);
    const production = readServerEnv({
      NODE_ENV: "production",
      COOKIE_SECRET: secret,
      SHIFT_SECONDS: "60",
    });
    expect(production.shiftSecondsOverride).toBeUndefined();
  });
});
