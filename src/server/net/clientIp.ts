import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

/** How to find the browser's address behind the host's proxies. */
export interface ClientIpRule {
  // A header the host's edge sets to the browser's address itself, overwriting any the
  // browser sent (e.g. cf-connecting-ip behind Cloudflare). Read first. null if none.
  header: string | null;
  // Proxies that append to X-Forwarded-For. 0 for none.
  trustedHops: number;
}

/** The first header value, when a header came more than once. */
function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `candidate` trimmed, if it's an IP address. */
function asIp(candidate: string | undefined): string | undefined {
  const trimmed = candidate?.trim();
  return trimmed !== undefined && isIP(trimmed) !== 0 ? trimmed : undefined;
}

/**
 * The IP address a connection comes from. Behind a host's proxies (production), the
 * connection's own address is a proxy's, the same for every player. The host's own client-IP
 * header is used if it has one. Otherwise X-Forwarded-For: each proxy appends the address
 * that connected to it, so the browser's address is `trustedHops` entries from the right;
 * anything further left was sent by the client and can be forged. With no rule (no proxy),
 * or nothing usable, it's the connection's own address.
 */
export function clientIp(
  headers: IncomingHttpHeaders,
  remoteAddress: string,
  rule: ClientIpRule | null,
): string {
  if (rule === null) {
    return remoteAddress;
  }
  const fromHeader = rule.header === null ? undefined : asIp(single(headers[rule.header]));
  if (fromHeader !== undefined) {
    return fromHeader;
  }
  const forwardedFor = headers["x-forwarded-for"];
  if (rule.trustedHops <= 0 || forwardedFor === undefined) {
    return remoteAddress;
  }
  const entries = [forwardedFor]
    .flat()
    .join(",")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return asIp(entries[Math.max(0, entries.length - rule.trustedHops)]) ?? remoteAddress;
}
