// The anonymous player id, kept in a signed, httpOnly cookie (accounts come later). The
// signature means a player can't pick someone else's id.

import { randomUUID } from "node:crypto";

// What a correctly signed cookie unsigns to. Matches @fastify/cookie's UnsignResult.
export type UnsignResult = { valid: true; renew: boolean; value: string } | { valid: false };

const PlayerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newPlayerId(): string {
  return randomUUID();
}

/** The player id in a signed cookie value, or undefined if it's missing or was tampered with. */
export function readPlayerId(
  signedValue: string | undefined,
  unsign: (value: string) => UnsignResult,
): string | undefined {
  if (!signedValue) {
    return undefined;
  }
  const result = unsign(signedValue);
  return result.valid && PlayerIdPattern.test(result.value) ? result.value : undefined;
}
