/** Whether an Origin header names this server's own site. A missing Origin doesn't count. */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || host === undefined) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    // e.g. "null" from a sandboxed frame or a file.
    return false;
  }
}

/**
 * Whether a socket connection comes from a page on this server's own site. Browsers always send an
 * Origin header on cross-site and WebSocket requests; a same-site GET may leave it out, and
 * those are fine because the player cookie (SameSite=Lax) is checked as well.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  return origin === undefined || isSameOrigin(origin, host);
}
