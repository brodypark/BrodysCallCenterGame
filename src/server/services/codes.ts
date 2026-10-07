// Fake card codes, e.g. GMA-7QZ: a prefix, then random characters from the safe alphabet in
// Config.Code. Made with the crypto module's randomness, so they can't be predicted.

import { randomInt } from "node:crypto";
import { normalizeCode } from "@shared/cardCode";
import { Config } from "@shared/Config";

function randomGroup(): string {
  const { Characters, GroupLength } = Config.Code;
  let group = "";
  for (let index = 0; index < GroupLength; index++) {
    group += Characters.charAt(randomInt(Characters.length));
  }
  return group;
}

/** A new code with `prefix` that `isTaken` (given the normalized code) says is free. There
 * are far more codes than a player could collect, so this almost never picks twice; it
 * throws if it can't find one after Config.Code.MaxGenerateAttempts picks. */
export function generateCode(prefix: string, isTaken: (normalized: string) => boolean): string {
  for (let attempt = 0; attempt < Config.Code.MaxGenerateAttempts; attempt++) {
    const groups = Array.from({ length: Config.Code.GroupCount }, randomGroup);
    const code = [prefix, ...groups].join("-");
    if (!isTaken(normalizeCode(code))) {
      return code;
    }
  }
  throw new Error(`No free ${prefix} code left after ${Config.Code.MaxGenerateAttempts} tries.`);
}
