// Turns the text Gemini sends back into a safe victim reply: checks it against the reply
// shape, clamps the suspicion change, tidies and shortens the line, and masks anything that
// looks like a card code. Ported from the Roblox AIService. Plain functions, so they're easy
// to test.
//
// Only the server's real code may appear in a victim's line, so anything the AI writes that
// looks like part of a card code is masked. Otherwise a player could get the victim to say a
// made-up one and waste a try on their real card. Codes are random letters and digits, so a
// word that mixes them back and forth (b7k, GMA7QZ), or is all capitals with a digit (7QZ),
// counts as code, and so does anything shaped like a whole code (ABC-123). Ordinary words
// like 1958, 1950s, 2nd or 9am are left alone.

import { z } from "zod";
import { Config } from "@shared/Config";
import type { AIReply } from "@server/scenarios/scenarioSchema";
import { clampSuspicionChange } from "@server/services/suspicion";

const CodeStandIn = "...";
const Ellipsis = "...";

/** The JSON Schema Gemini is asked to follow (structured output). */
export const AIReplyJsonSchema = {
  type: "object",
  properties: {
    reply: { type: "string", description: "What you say on the phone." },
    suspicionChange: { type: "integer", description: "How much your suspicion changes." },
    revealsCode: { type: "boolean", description: "True when you read out the gift card." },
    revealsCard: { type: "boolean", description: "True when you read out the Wobblebucks Card." },
  },
  required: ["reply", "suspicionChange", "revealsCode", "revealsCard"],
} as const;

// What the model sent, checked loosely: the text and number are cleaned up afterwards, and
// any extra fields are ignored.
const RawReplySchema = z.object({
  reply: z.string(),
  suspicionChange: z.number(),
  revealsCode: z.boolean(),
  // A reply without it just doesn't pay for anything.
  revealsCard: z.boolean().optional(),
});

// Any dash, including the typographic ones a model likes to use.
const Dash = "\\-\\u2010-\\u2015\\u2212";
const AlnumBefore = "(?<![A-Za-z0-9])";
const AlnumAfter = "(?![A-Za-z0-9])";
const { PrefixLength, GroupCount, GroupLength, Characters } = Config.Code;

// Any all-caps run shaped like a whole code, whatever its prefix (ABC-123, XYZ 7QZ).
const AnyCodeShape = new RegExp(
  `${AlnumBefore}[A-Z0-9]{${PrefixLength}}(?:[\\s${Dash}]+[A-Z0-9]{${GroupLength}}){${GroupCount}}${AlnumAfter}`,
  "g",
);
const Separators = new RegExp(`[\\s${Dash}]+`);
const CodeCharactersOnly = new RegExp(`^[${Characters}]+$`);
const Word = /[A-Za-z0-9]+/g;

/** Patterns for a code that starts with `prefix`: with dashes in any case (gma-bcd), or in
 * capitals with spaces or dashes (GMA BCD). These catch made-up codes with no digits, which
 * looksLikeCode misses. Prefixes aren't words, so ordinary hyphenated words don't match. */
function prefixedCodePatterns(prefix: string): RegExp[] {
  const escaped = prefix.replace(/[^A-Za-z0-9]/g, "\\$&");
  return [
    new RegExp(
      `${AlnumBefore}${escaped}(?:[${Dash}][A-Za-z0-9]{${GroupLength},}){${GroupCount}}`,
      "gi",
    ),
    new RegExp(
      `${AlnumBefore}${escaped}(?:[\\s${Dash}]+[A-Z0-9]{${GroupLength},}){${GroupCount}}`,
      "g",
    ),
  ];
}

/** True for words that switch between letters and digits and back, like codes do, or that
 * are all capitals and digits with both in (7QZ, QZ7). */
function looksLikeCode(word: string): boolean {
  if (/\d[A-Za-z]+\d/.test(word) || /[A-Za-z]\d+[A-Za-z]/.test(word)) {
    return true;
  }
  return /^[A-Z0-9]+$/.test(word) && /\d/.test(word) && /[A-Z]/.test(word);
}

/** For an AnyCodeShape match: true if it could pass for a real code, because it has a digit
 * or its random part only uses code characters. WOO-HOO and AND THE are left alone. */
function couldPassForCode(token: string): boolean {
  if (/\d/.test(token)) {
    return true;
  }
  return token
    .split(Separators)
    .slice(1)
    .every((group) => CodeCharactersOnly.test(group));
}

/** Replaces anything that looks like part of a card code with "...". `prefix` is the
 * scenario's code prefix (e.g. GMA); made-up Wobblebucks Card codes are masked too. */
export function maskCodes(text: string, prefix: string): string {
  let masked = text;
  for (const knownPrefix of [prefix, Config.Card.Prefix]) {
    for (const pattern of prefixedCodePatterns(knownPrefix)) {
      masked = masked.replace(pattern, CodeStandIn);
    }
  }
  masked = masked.replace(AnyCodeShape, (token) => (couldPassForCode(token) ? CodeStandIn : token));
  return masked.replace(Word, (word) => (looksLikeCode(word) ? CodeStandIn : word));
}

/** Tidies a reply: one line, single spaces, no code look-alikes, and cut at a word break
 * with "..." if it's longer than Config.AI.MaxReplyLength characters. */
export function cleanReplyText(text: string, codePrefix: string): string {
  const oneLine = text
    .replace(/\p{Cc}|\p{Cs}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = maskCodes(oneLine, codePrefix);
  const characters = [...cleaned];
  if (characters.length <= Config.AI.MaxReplyLength) {
    return cleaned;
  }
  const shortened = characters.slice(0, Config.AI.MaxReplyLength - Ellipsis.length).join("");
  // Back up to the last space so a word isn't cut in half.
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened).trimEnd()}${Ellipsis}`;
}

/** The JSON object inside generated text: from the first "{" to the last "}". Structured
 * output should send bare JSON, but this also copes with a code fence around it. */
function extractJson(text: string): string | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  return first === -1 || last < first ? null : text.slice(first, last + 1);
}

/** Checks generated text against the reply shape and cleans it up. Returns null if it
 * doesn't fit or there's nothing left to say. */
export function parseAIReply(text: string, codePrefix: string): AIReply | null {
  const json = extractJson(text);
  if (json === null) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = RawReplySchema.safeParse(decoded);
  if (!parsed.success) {
    return null;
  }
  const reply = cleanReplyText(parsed.data.reply, codePrefix);
  if (reply === "") {
    return null;
  }
  return {
    reply,
    suspicionChange: clampSuspicionChange(parsed.data.suspicionChange),
    revealsCode: parsed.data.revealsCode,
    revealsCard: parsed.data.revealsCard ?? false,
  };
}
