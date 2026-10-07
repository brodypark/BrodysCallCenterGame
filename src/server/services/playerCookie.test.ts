import fastifyCookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { newPlayerId, readPlayerId } from "@server/services/playerCookie";

const signer = fastifyCookie.signerFactory("test-secret-that-is-long-enough-to-use");
const otherSigner = fastifyCookie.signerFactory("a-different-secret-entirely-for-tests");
const unsign = (value: string): ReturnType<typeof signer.unsign> => signer.unsign(value);

describe("player cookie", () => {
  it("reads back an id it signed", () => {
    const id = newPlayerId();
    expect(readPlayerId(signer.sign(id), unsign)).toBe(id);
  });

  it("gives a different id each time", () => {
    expect(newPlayerId()).not.toBe(newPlayerId());
  });

  it("rejects missing, unsigned, tampered and foreign cookies", () => {
    const id = newPlayerId();
    expect(readPlayerId(undefined, unsign)).toBeUndefined();
    expect(readPlayerId(id, unsign)).toBeUndefined();
    const signed = signer.sign(id);
    const tampered = signed.slice(0, -1) + (signed.endsWith("A") ? "B" : "A");
    expect(readPlayerId(tampered, unsign)).toBeUndefined();
    expect(readPlayerId(otherSigner.sign(id), unsign)).toBeUndefined();
  });

  it("rejects correctly signed values that aren't player ids", () => {
    expect(readPlayerId(signer.sign("admin"), unsign)).toBeUndefined();
  });
});
