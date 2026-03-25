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
  USE_FULL_MODE: true,
  USE_PUSH_TO_TALK_FOR_FULL: false,
  ELEVENLABS_API_KEY: "",
  OPENAI_API_KEY: "",
  USE_ELEVENLABS_FOR_LITE: false,
  USE_OPENAI_FOR_LITE: false,
  USE_OPENAI_REALTIME_FOR_LITE: false,
  USE_TRUE_LITE: false,
  OPENAI_REALTIME_API_KEY: "",
  OPENAI_REALTIME_SECRET_ID: "",
  OPENAI_REALTIME_PROMPT_ID: "",
  OPENAI_REALTIME_MODEL: "gpt-realtime",
  OPENAI_REALTIME_VOICE: "marin",
  OPENAI_REALTIME_TEMPERATURE: 0.8,
  OPENAI_REALTIME_INSTRUCTIONS: "",
  USE_IARA: false,
  IARA_WS_URL: "",
  IARA_API_URL: "",
  IARA_SYSTEM_PROMPT: "",
  IARA_PRESET_ID: "",
  /** Browser-side AEC using session video playback as reference (True Lite / iara only). */
  USE_AVATAR_AEC: false,
} as const;

/** Normalize USE_AVATAR_AEC from JSON/env (handles true, "true", 1, etc.). */
export function normalizeUseAvatarAec(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  }
  if (typeof value === "number") return value === 1;
  return false;
}

export type Config = {
  API_KEY: string;
  API_URL: string;
  AVATAR_ID: string;
  IS_SANDBOX: boolean;
  VOICE_ID: string;
  CONTEXT_ID: string;
  LANGUAGE: string;
  USE_FULL_MODE: boolean;
  USE_PUSH_TO_TALK_FOR_FULL: boolean;
  ELEVENLABS_API_KEY: string;
  OPENAI_API_KEY: string;
  USE_ELEVENLABS_FOR_LITE: boolean;
  USE_OPENAI_FOR_LITE: boolean;
  USE_OPENAI_REALTIME_FOR_LITE: boolean;
  USE_TRUE_LITE: boolean;
  OPENAI_REALTIME_API_KEY: string;
  OPENAI_REALTIME_SECRET_ID: string;
  OPENAI_REALTIME_PROMPT_ID: string;
  OPENAI_REALTIME_MODEL: string;
  OPENAI_REALTIME_VOICE: string;
  OPENAI_REALTIME_TEMPERATURE: number;
  OPENAI_REALTIME_INSTRUCTIONS: string;
  USE_IARA: boolean;
  IARA_WS_URL: string;
  IARA_API_URL: string;
  IARA_SYSTEM_PROMPT: string;
  IARA_PRESET_ID: string;
  USE_AVATAR_AEC: boolean;
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
  if (process.env.OPENAI_REALTIME_SECRET_ID != null)
    fromEnv.OPENAI_REALTIME_SECRET_ID = process.env.OPENAI_REALTIME_SECRET_ID;
  if (process.env.OPENAI_REALTIME_MODEL != null)
    fromEnv.OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL;
  if (process.env.OPENAI_REALTIME_VOICE != null)
    fromEnv.OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE;
  if (process.env.OPENAI_REALTIME_TEMPERATURE != null) {
    const v = Number(process.env.OPENAI_REALTIME_TEMPERATURE);
    if (!Number.isNaN(v)) fromEnv.OPENAI_REALTIME_TEMPERATURE = v;
  }
  if (process.env.USE_OPENAI_REALTIME_FOR_LITE != null)
    fromEnv.USE_OPENAI_REALTIME_FOR_LITE =
      process.env.USE_OPENAI_REALTIME_FOR_LITE === "true" ||
      process.env.USE_OPENAI_REALTIME_FOR_LITE === "1";
  if (process.env.USE_TRUE_LITE != null)
    fromEnv.USE_TRUE_LITE =
      process.env.USE_TRUE_LITE === "true" || process.env.USE_TRUE_LITE === "1";
  if (process.env.USE_AVATAR_AEC != null)
    fromEnv.USE_AVATAR_AEC =
      process.env.USE_AVATAR_AEC === "true" ||
      process.env.USE_AVATAR_AEC === "1";
  if (process.env.OPENAI_REALTIME_PROMPT_ID != null)
    fromEnv.OPENAI_REALTIME_PROMPT_ID = process.env.OPENAI_REALTIME_PROMPT_ID;

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
      if (
        anyFile.openai_realtime_api_key !== undefined &&
        fromFile.OPENAI_REALTIME_API_KEY === undefined
      )
        fromFile.OPENAI_REALTIME_API_KEY = String(
          anyFile.openai_realtime_api_key,
        );
      if (
        anyFile.openai_realtime_secret_id !== undefined &&
        fromFile.OPENAI_REALTIME_SECRET_ID === undefined
      )
        fromFile.OPENAI_REALTIME_SECRET_ID = String(
          anyFile.openai_realtime_secret_id,
        );
      if (
        anyFile.openai_realtime_model !== undefined &&
        fromFile.OPENAI_REALTIME_MODEL === undefined
      )
        fromFile.OPENAI_REALTIME_MODEL = String(anyFile.openai_realtime_model);
      if (
        anyFile.openai_realtime_voice !== undefined &&
        fromFile.OPENAI_REALTIME_VOICE === undefined
      )
        fromFile.OPENAI_REALTIME_VOICE = String(anyFile.openai_realtime_voice);
      if (
        anyFile.openai_realtime_temperature !== undefined &&
        fromFile.OPENAI_REALTIME_TEMPERATURE === undefined
      ) {
        const v = Number(anyFile.openai_realtime_temperature);
        if (!Number.isNaN(v)) fromFile.OPENAI_REALTIME_TEMPERATURE = v;
      }
      if (
        anyFile.openai_realtime_instructions !== undefined &&
        fromFile.OPENAI_REALTIME_INSTRUCTIONS === undefined
      )
        fromFile.OPENAI_REALTIME_INSTRUCTIONS = String(
          anyFile.openai_realtime_instructions,
        );
      if (
        anyFile.use_openai_realtime_for_lite !== undefined &&
        fromFile.USE_OPENAI_REALTIME_FOR_LITE === undefined
      )
        fromFile.USE_OPENAI_REALTIME_FOR_LITE = Boolean(
          anyFile.use_openai_realtime_for_lite,
        );
      if (
        anyFile.use_true_lite !== undefined &&
        fromFile.USE_TRUE_LITE === undefined
      )
        fromFile.USE_TRUE_LITE = Boolean(anyFile.use_true_lite);
      if (
        anyFile.openai_realtime_prompt_id !== undefined &&
        fromFile.OPENAI_REALTIME_PROMPT_ID === undefined
      )
        fromFile.OPENAI_REALTIME_PROMPT_ID = String(
          anyFile.openai_realtime_prompt_id,
        );
      if (
        anyFile.use_full_mode !== undefined &&
        fromFile.USE_FULL_MODE === undefined
      )
        fromFile.USE_FULL_MODE = Boolean(anyFile.use_full_mode);
      if (
        anyFile.use_push_to_talk_for_full !== undefined &&
        fromFile.USE_PUSH_TO_TALK_FOR_FULL === undefined
      )
        fromFile.USE_PUSH_TO_TALK_FOR_FULL = Boolean(
          anyFile.use_push_to_talk_for_full,
        );
      if (anyFile.use_iara !== undefined && fromFile.USE_IARA === undefined)
        fromFile.USE_IARA = Boolean(anyFile.use_iara);
      if (
        anyFile.iara_ws_url !== undefined &&
        fromFile.IARA_WS_URL === undefined
      )
        fromFile.IARA_WS_URL = String(anyFile.iara_ws_url);
      if (
        anyFile.iara_api_url !== undefined &&
        fromFile.IARA_API_URL === undefined
      )
        fromFile.IARA_API_URL = String(anyFile.iara_api_url);
      if (
        anyFile.iara_system_prompt !== undefined &&
        fromFile.IARA_SYSTEM_PROMPT === undefined
      )
        fromFile.IARA_SYSTEM_PROMPT = String(anyFile.iara_system_prompt);
      if (
        anyFile.iara_preset_id !== undefined &&
        fromFile.IARA_PRESET_ID === undefined
      )
        fromFile.IARA_PRESET_ID = String(anyFile.iara_preset_id);
      if (
        anyFile.use_avatar_aec !== undefined &&
        fromFile.USE_AVATAR_AEC === undefined
      )
        fromFile.USE_AVATAR_AEC = Boolean(anyFile.use_avatar_aec);
    }
  } catch {
    // ignore parse errors; use defaults
  }

  const merged = {
    ...DEFAULTS,
    ...fromFile,
    ...fromEnv,
  };
  return {
    ...merged,
    USE_AVATAR_AEC: normalizeUseAvatarAec(
      (merged as Record<string, unknown>).USE_AVATAR_AEC,
    ),
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
