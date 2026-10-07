// Reads the server's environment: .env in development, real environment variables when
// deployed. Server only: the client must never see these values.

import { ServerConfig } from "@server/config";

export interface ServerEnv {
  port: number;
  host: string;
  isProduction: boolean;
  // Not needed until the AI (step 8) and voice (steps 9-10) arrive, so they may be missing.
  geminiApiKey: string | undefined;
  elevenLabsApiKey: string | undefined;
}

const MaxPort = 65535;

/** Parses a port number, using the fallback when it's unset. Throws on a bad value. */
export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > MaxPort) {
    throw new Error(`PORT must be a whole number from 1 to ${MaxPort}, got "${value}".`);
  }
  return port;
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/** Builds the typed server settings from a set of environment variables. */
export function readServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  return {
    port: parsePort(env.PORT, ServerConfig.DefaultPort),
    host: optionalString(env.HOST) ?? ServerConfig.DefaultHost,
    isProduction: env.NODE_ENV === "production",
    geminiApiKey: optionalString(env.GEMINI_API_KEY),
    elevenLabsApiKey: optionalString(env.ELEVENLABS_API_KEY),
  };
}

/** Loads .env from the working directory if there is one, then reads the environment. */
export function loadServerEnv(): ServerEnv {
  try {
    // Variables already set in the real environment win over the file.
    process.loadEnvFile();
  } catch (error) {
    // No .env file is fine (e.g. when deployed); anything else (a malformed file) isn't.
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  return readServerEnv(process.env);
}
