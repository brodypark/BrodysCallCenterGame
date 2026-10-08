// Reads the server's environment: .env in development, real environment variables when
// deployed. Server only: the client must never see these values.

import { ServerConfig } from "@server/config";

export interface ServerEnv {
  port: number;
  host: string;
  isProduction: boolean;
  // Signs the player id cookie.
  cookieSecret: string;
  // True when COOKIE_SECRET wasn't set and the development fallback is in use.
  usingDevCookieSecret: boolean;
  // Development only: a shorter shift for testing (SHIFT_SECONDS). Always undefined in
  // production.
  shiftSecondsOverride: number | undefined;
  // Optional: without them, victims use scripted replies and don't speak.
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

/** A positive whole number of seconds, or undefined when unset. Throws on a bad value. */
export function parseSeconds(name: string, value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new Error(`${name} must be a whole number of seconds, 1 or more, got "${value}".`);
  }
  return seconds;
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/** Builds the typed server settings from a set of environment variables. Throws if
 * production is missing something it needs. */
export function readServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const isProduction = env.NODE_ENV === "production";
  const cookieSecret = optionalString(env.COOKIE_SECRET);
  const { MinSecretLength, DevSecret } = ServerConfig.PlayerCookie;
  if (isProduction && (cookieSecret === undefined || cookieSecret.length < MinSecretLength)) {
    throw new Error(`COOKIE_SECRET must be set to at least ${MinSecretLength} characters.`);
  }
  return {
    port: parsePort(env.PORT, ServerConfig.DefaultPort),
    host: optionalString(env.HOST) ?? ServerConfig.DefaultHost,
    isProduction,
    cookieSecret: cookieSecret ?? DevSecret,
    usingDevCookieSecret: cookieSecret === undefined,
    shiftSecondsOverride: isProduction
      ? undefined
      : parseSeconds("SHIFT_SECONDS", env.SHIFT_SECONDS),
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
