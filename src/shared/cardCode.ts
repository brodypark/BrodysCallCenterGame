// Card codes as players type them. Codes are compared in capitals with spaces and dashes
// removed, so "gma 7qz" matches GMA-7QZ.

import { Config } from "@shared/Config";

/** The form codes are compared in: capitals, without spaces or dashes. */
export function normalizeCode(text: string): string {
  return text.replace(/[\s-]/g, "").toUpperCase();
}

/** What a code looks like, e.g. XXX-XXX, for a text box's placeholder. */
export function codePlaceholder(prefix: string = "X".repeat(Config.Code.PrefixLength)): string {
  const group = `-${"X".repeat(Config.Code.GroupLength)}`;
  return prefix + group.repeat(Config.Code.GroupCount);
}
