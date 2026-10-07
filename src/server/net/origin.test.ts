import { describe, expect, it } from "vitest";
import { isAllowedOrigin, isSameOrigin } from "@server/net/origin";

describe("isAllowedOrigin", () => {
  it("allows pages from the same host, and requests without an Origin", () => {
    expect(isAllowedOrigin("http://localhost:5173", "localhost:5173")).toBe(true);
    expect(isAllowedOrigin("https://scamgpt.example", "scamgpt.example")).toBe(true);
    expect(isAllowedOrigin(undefined, "localhost:5173")).toBe(true);
  });

  it("turns away other sites, other ports and odd origins", () => {
    expect(isAllowedOrigin("https://evil.example", "scamgpt.example")).toBe(false);
    expect(isAllowedOrigin("http://localhost:4000", "localhost:5173")).toBe(false);
    expect(isAllowedOrigin("null", "localhost:5173")).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173", undefined)).toBe(false);
  });
});

describe("isSameOrigin", () => {
  it("needs an Origin header naming this host", () => {
    expect(isSameOrigin("http://localhost:5173", "localhost:5173")).toBe(true);
    expect(isSameOrigin(undefined, "localhost:5173")).toBe(false);
    expect(isSameOrigin("https://evil.example", "localhost:5173")).toBe(false);
  });
});
