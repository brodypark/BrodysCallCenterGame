// The shape of a scam scenario, as a Zod schema, so a broken scenario module fails at server
// startup instead of in the middle of a call. Scenarios stay on the server: the client only
// ever sees what the call snapshot sends.

import { z } from "zod";
import { Config } from "@shared/Config";
import type { Difficulty } from "@shared/types";

const text = z.string().trim().min(1);
const textList = z.array(text).min(1);
// Scripted lines are spoken as they are, so each must fit like an AI reply does.
const line = text.max(Config.AI.MaxReplyLength);
const suspicion = z.number().int().min(Config.Suspicion.Min).max(Config.Suspicion.Max);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "must be a color like #ffdcbe");

export const DifficultySchema = z.enum(["Easy", "Medium", "Hard"]) satisfies z.ZodType<Difficulty>;

const PersonaSchema = z.strictObject({
  name: text,
  personality: text,
  quirks: textList,
  // A running gag they bring up only now and then. The server decides each turn whether the
  // AI may mention it (Config.AI.ObsessionChance, step 8).
  obsession: text,
  catchphrases: textList,
  // What makes them trust the help line more, and less. These win over the general
  // suspicion rules.
  likes: textList,
  dislikes: textList,
});

// ElevenLabs voice settings for the streaming text-to-speech endpoint.
const VoiceSchema = z.strictObject({
  voiceId: text,
  stability: z.number().min(0).max(1),
  similarityBoost: z.number().min(0).max(1),
  style: z.number().min(0).max(1),
});

// How the cartoon face is drawn (step 11). Extras can be left out.
const FaceSchema = z.strictObject({
  skin: hexColor,
  hair: hexColor,
  hairStyle: z.enum(["Bun", "Long", "Short", "Bald"]),
  glasses: z.boolean(),
  earrings: z.boolean(),
  // Rosy cheeks.
  blush: z.boolean(),
  hat: z
    .strictObject({
      style: z.enum(["Tricorn", "TinFoil", "Deerstalker", "Headband"]),
      color: hexColor,
    })
    .optional(),
  // Drawn in the hair color. A beard comes with a mustache.
  facialHair: z.enum(["Mustache", "Beard"]).optional(),
  // Over the left eye.
  eyepatch: z.boolean().optional(),
  antennae: z.boolean().optional(),
});

/** What the AI replies each turn, and the shape of every scripted fallback reply. */
export const AIReplySchema = z.strictObject({
  reply: line,
  suspicionChange: z.number().int(),
  revealsCode: z.boolean(),
  // They agreed to pay for their side problem with their Wobblebucks Card.
  revealsCard: z.boolean().optional(),
});

const LinesSchema = z.strictObject({
  // Said when the call is answered: one picked at random, so calls open differently.
  greetings: z.array(line).min(1),
  // Used in order (then starting over) when the AI is off or fails. Tuned so suspicion
  // drifts below the trust level and they read the code around turn 9-10.
  fallbackReplies: z.array(AIReplySchema).min(1),
  // Added after the reply when they reveal the code. The server replaces {code}.
  revealLine: line.refine((value) => value.includes("{code}"), "must contain {code}"),
  // Added after the reply when suspicion reaches the hang-up threshold.
  hangUpLine: line,
  // Added after the reply when they offer to read the card but the server says not yet.
  notReadyLine: line,
});

// A second problem a victim may have, which the help line can offer to fix for a fee.
const SideProblemSchema = z.strictObject({
  // Told to the AI, e.g. "Her computer box is full of flashing pop-ups".
  description: text,
  // Added after the reply when they read out their Wobblebucks Card. The server replaces {card}.
  cardLine: line.refine((value) => value.includes("{card}"), "must contain {card}"),
  // The most their card can be charged, in dollars. Kept on the server.
  spendingLimit: z.number().int().min(Config.Card.MinChargeAmount).max(Config.Card.MaxChargeAmount),
});

const codePrefixPattern = new RegExp(`^[A-Z0-9]{${Config.Code.PrefixLength}}$`);

export const ScenarioSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "must be a camelCase id, e.g. grandma"),
    displayName: text,
    difficulty: DifficultySchema,
    // Player level needed before this scenario can call. 1 = from the start.
    unlockLevel: z.number().int().min(1),
    persona: PersonaSchema,
    // Why they're calling, and what they need help with.
    situation: text,
    // What the player is trying to get out of them.
    prize: text,
    // Money paid out when this scenario's code is redeemed.
    cardValue: z.number().int().positive(),
    // Start of the fake code, e.g. GMA for GMA-7QZ. Not a real word: the AI's replies are
    // cleaned of anything shaped like a code with this prefix.
    codePrefix: z
      .string()
      .regex(codePrefixPattern, `must be ${Config.Code.PrefixLength} capitals or digits`)
      .refine((prefix) => prefix !== Config.Card.Prefix, "is saved for Wobblebucks Cards"),
    startingSuspicion: suspicion,
    // The victim hangs up when suspicion reaches this.
    suspicionThreshold: suspicion,
    // The code can only be revealed while suspicion is below this.
    trustLevel: suspicion,
    voice: VoiceSchema,
    face: FaceSchema,
    lines: LinesSchema,
    sideProblem: SideProblemSchema.optional(),
  })
  .superRefine((scenario, context) => {
    if (scenario.trustLevel >= scenario.suspicionThreshold) {
      context.addIssue({
        code: "custom",
        path: ["trustLevel"],
        message: "must be below suspicionThreshold",
      });
    }
    if (scenario.startingSuspicion >= scenario.suspicionThreshold) {
      context.addIssue({
        code: "custom",
        path: ["startingSuspicion"],
        message: "must be below suspicionThreshold",
      });
    }
  });

export type Scenario = z.output<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;
export type AIReply = z.output<typeof AIReplySchema>;
