// The one place that talks to Gemini, through Google's official SDK (@google/genai, the
// Interactions API). AIService only sees the small VictimModel interface, so tests swap in
// a fake and never call the real API.
//
// Checked against the SDK's own types (2.28.0) and ai.google.dev, 2026-10-07:
// - interactions.create takes system_instruction, input, response_format (JSON Schema),
//   generation_config (max_output_tokens, thinking_level).
// - safety_settings is refused on the Gemini API ("only available on the Gemini Enterprise
//   Agent Platform", found in testing 2026-10-07), so the model's default filters apply.
//   The system prompt keeps replies all-ages, and a reply only ever reaches its own player.
// - store: false, so Google doesn't keep each call for later retrieval. Every turn sends
//   the whole call anyway.
// - The SDK's own retries are turned off (AIService retries), and a request stops when its
//   AbortSignal fires.
// - The API key goes in a request header, but errors are still scrubbed of it before
//   anything is logged.

import { GoogleGenAI } from "@google/genai";
import { Config } from "@shared/Config";
import { AIReplyJsonSchema } from "@server/services/aiReply";

export interface TokenUsage {
  input: number;
  output: number;
  cached: number;
  thought: number;
}

export interface ModelRequest {
  systemInstruction: string;
  input: string;
  // Fires when AIService stops waiting (timeout, call over, player gone).
  signal: AbortSignal;
}

export interface ModelResponse {
  // The generated text, or null if there wasn't any (e.g. blocked).
  text: string | null;
  // "completed" when the model finished normally.
  status: string;
  usage: TokenUsage;
}

/** Something that writes a victim's reply. Rejects with a ModelRequestError on failure. */
export interface VictimModel {
  generate: (request: ModelRequest) => Promise<ModelResponse>;
}

/** A failed request, with the API key scrubbed from the message. */
export class ModelRequestError extends Error {
  // The HTTP status, if the API answered.
  readonly status: number | undefined;

  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = "ModelRequestError";
    this.status = status;
  }
}

/** The HTTP status on one of the SDK's errors, if it has one. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  if (typeof statusCode === "number") {
    return statusCode;
  }
  return typeof status === "number" ? status : undefined;
}

/** A VictimModel backed by the real Gemini API. */
export function createGeminiModel(apiKey: string): VictimModel {
  const ai = new GoogleGenAI({ apiKey });
  const scrub = (text: string): string => text.replaceAll(apiKey, "[GEMINI_API_KEY]");

  return {
    generate: async ({ systemInstruction, input, signal }) => {
      try {
        const interaction = await ai.interactions.create(
          {
            model: Config.AI.Model,
            system_instruction: systemInstruction,
            input,
            store: false,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: AIReplyJsonSchema,
            },
            generation_config: {
              max_output_tokens: Config.AI.MaxOutputTokens,
              thinking_level: Config.AI.ThinkingLevel,
            },
          },
          { signal, retries: { strategy: "none" } },
        );
        const usage = interaction.usage;
        return {
          text: interaction.output_text ?? null,
          status: interaction.status,
          usage: {
            input: usage?.total_input_tokens ?? 0,
            output: usage?.total_output_tokens ?? 0,
            cached: usage?.total_cached_tokens ?? 0,
            thought: usage?.total_thought_tokens ?? 0,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        throw new ModelRequestError(scrub(message), statusOf(error));
      }
    },
  };
}
