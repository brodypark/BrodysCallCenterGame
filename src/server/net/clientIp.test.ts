import { describe, expect, it } from "vitest";
import { type ClientIpRule, clientIp } from "@server/net/clientIp";

const Proxy: ClientIpRule = { header: null, trustedHops: 1 };
const Cloudflare: ClientIpRule = { header: "cf-connecting-ip", trustedHops: 1 };

describe("clientIp", () => {
  it("uses the connection's own address when there's no proxy", () => {
    expect(clientIp({ "x-forwarded-for": "203.0.113.7" }, "10.0.0.2", null)).toBe("10.0.0.2");
  });

  it("uses the address the trusted proxy appended, not ones the client sent", () => {
    expect(clientIp({ "x-forwarded-for": "203.0.113.7" }, "10.0.0.2", Proxy)).toBe("203.0.113.7");
    // The client forged the first entry; the proxy appended the real one.
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }, "10.0.0.2", Proxy)).toBe(
      "203.0.113.7",
    );
    // Two proxies: the browser's address is second from the right.
    const twoHops = { header: null, trustedHops: 2 };
    expect(
      clientIp({ "x-forwarded-for": "1.2.3.4, 203.0.113.7, 10.1.1.1" }, "10.0.0.2", twoHops),
    ).toBe("203.0.113.7");
    expect(clientIp({ "x-forwarded-for": "2001:db8::1" }, "10.0.0.2", Proxy)).toBe("2001:db8::1");
  });

  it("prefers the host's own client-IP header", () => {
    const headers = { "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "1.2.3.4, 10.1.1.1" };
    expect(clientIp(headers, "10.0.0.2", Cloudflare)).toBe("198.51.100.4");
    // Ignored when the host has no such header, so a client can't send its own.
    expect(clientIp(headers, "10.0.0.2", Proxy)).toBe("10.1.1.1");
  });

  it("falls back when a header is missing or isn't an IP address", () => {
    expect(clientIp({}, "10.0.0.2", Cloudflare)).toBe("10.0.0.2");
    expect(
      clientIp(
        { "cf-connecting-ip": "nope", "x-forwarded-for": "203.0.113.7" },
        "10.0.0.2",
        Cloudflare,
      ),
    ).toBe("203.0.113.7");
    expect(clientIp({ "x-forwarded-for": " " }, "10.0.0.2", Proxy)).toBe("10.0.0.2");
    expect(clientIp({ "x-forwarded-for": "not-an-ip" }, "10.0.0.2", Proxy)).toBe("10.0.0.2");
  });
});
