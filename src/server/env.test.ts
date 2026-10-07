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
      geminiApiKey: undefined,
      elevenLabsApiKey: undefined,
    });
  });

  it("reads production mode and keys", () => {
    const env = readServerEnv({
      NODE_ENV: "production",
      PORT: "4000",
      GEMINI_API_KEY: "gemini-test",
      ELEVENLABS_API_KEY: "eleven-test",
    });
    expect(env.isProduction).toBe(true);
    expect(env.port).toBe(4000);
    expect(env.geminiApiKey).toBe("gemini-test");
    expect(env.elevenLabsApiKey).toBe("eleven-test");
  });
});
