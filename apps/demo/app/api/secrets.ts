import fs from "fs";
import path from "path";

/** Default values when no config file exists. Do not put real secrets here. */
const DEFAULTS = {
  API_KEY: "",
  API_URL: "https://api.liveavatar.com",
  AVATAR_ID: "",
  IS_SANDBOX: true,
  VOICE_ID: "",
  CONTEXT_ID: "",
  LANGUAGE: "pt",
  ELEVENLABS_API_KEY: "",
  OPENAI_API_KEY: "",
  USE_ELEVENLABS_FOR_LITE: false,
  USE_OPENAI_FOR_LITE: false,
} as const;

export type Config = {
  API_KEY: string;
  API_URL: string;
  AVATAR_ID: string;
  IS_SANDBOX: boolean;
  VOICE_ID: string;
  CONTEXT_ID: string;
  LANGUAGE: string;
  ELEVENLABS_API_KEY: string;
  OPENAI_API_KEY: string;
  USE_ELEVENLABS_FOR_LITE: boolean;
  USE_OPENAI_FOR_LITE: boolean;
};

function getConfigPath(): string {
  const writePath = getConfigWritePath();
  if (fs.existsSync(writePath)) return writePath;
  const cwd = process.cwd();
  const inApp = path.join(cwd, "config.local.json");
  if (fs.existsSync(inApp)) return inApp;
  return writePath;
}

/**
 * Load config from config.local.json (if present), merged with env and defaults.
 * Server-only: use in API routes and server components only.
 */
export function getConfig(): Config {
  const fromEnv: Partial<Config> = {};
  if (process.env.LIVEAVATAR_API_KEY != null)
    fromEnv.API_KEY = process.env.LIVEAVATAR_API_KEY;
  if (process.env.LIVEAVATAR_API_URL != null)
    fromEnv.API_URL = process.env.LIVEAVATAR_API_URL;
  if (process.env.LIVEAVATAR_AVATAR_ID != null)
    fromEnv.AVATAR_ID = process.env.LIVEAVATAR_AVATAR_ID;
  if (process.env.LIVEAVATAR_IS_SANDBOX != null)
    fromEnv.IS_SANDBOX =
      process.env.LIVEAVATAR_IS_SANDBOX === "true" ||
      process.env.LIVEAVATAR_IS_SANDBOX === "1";
  if (process.env.LIVEAVATAR_VOICE_ID != null)
    fromEnv.VOICE_ID = process.env.LIVEAVATAR_VOICE_ID;
  if (process.env.LIVEAVATAR_CONTEXT_ID != null)
    fromEnv.CONTEXT_ID = process.env.LIVEAVATAR_CONTEXT_ID;
  if (process.env.LIVEAVATAR_LANGUAGE != null)
    fromEnv.LANGUAGE = process.env.LIVEAVATAR_LANGUAGE;
  if (process.env.ELEVENLABS_API_KEY != null)
    fromEnv.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (process.env.OPENAI_API_KEY != null)
    fromEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const configPath = getConfigPath();
  let fromFile: Partial<Config> = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      fromFile = JSON.parse(raw) as Partial<Config>;
      // Normalize lowercase keys (e.g. from manual file edit) so config has uppercase
      const anyFile = fromFile as Record<string, unknown>;
      if (anyFile.voice_id !== undefined && fromFile.VOICE_ID === undefined)
        fromFile.VOICE_ID = String(anyFile.voice_id);
      if (anyFile.context_id !== undefined && fromFile.CONTEXT_ID === undefined)
        fromFile.CONTEXT_ID = String(anyFile.context_id);
      if (anyFile.avatar_id !== undefined && fromFile.AVATAR_ID === undefined)
        fromFile.AVATAR_ID = String(anyFile.avatar_id);
    }
  } catch {
    // ignore parse errors; use defaults
  }

  return {
    ...DEFAULTS,
    ...fromFile,
    ...fromEnv,
  } as Config;
}

/** Path where config is written (for POST /api/config). Resolves to app dir. */
export function getConfigWritePath(): string {
  const cwd = process.cwd();
  if (cwd.endsWith(path.sep + "demo") || cwd.endsWith("/demo")) {
    return path.join(cwd, "config.local.json");
  }
  return path.join(cwd, "apps", "demo", "config.local.json");
}

export const DEFAULT_CONFIG = DEFAULTS;
