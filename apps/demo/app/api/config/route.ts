import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { SANDBOX_AVATAR_ID } from "../../../src/config/sandboxAvatar";
import { getConfig, getConfigWritePath, type Config } from "../secrets";

function validateBody(body: unknown): body is Config {
  if (body == null || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  if (typeof o.API_KEY !== "string") return false;
  if (typeof o.API_URL !== "string") return false;
  if (typeof o.AVATAR_ID !== "string") return false;
  if (typeof o.IS_SANDBOX !== "boolean") return false;
  if (typeof o.VOICE_ID !== "string") return false;
  if (typeof o.CONTEXT_ID !== "string") return false;
  if (typeof o.LANGUAGE !== "string") return false;
  if (typeof o.USE_FULL_MODE !== "boolean") return false;
  if (typeof o.USE_PUSH_TO_TALK_FOR_FULL !== "boolean") return false;
  if (typeof o.ELEVENLABS_API_KEY !== "string") return false;
  if (typeof o.OPENAI_API_KEY !== "string") return false;
  if (typeof o.USE_ELEVENLABS_FOR_LITE !== "boolean") return false;
  if (typeof o.USE_OPENAI_FOR_LITE !== "boolean") return false;
  if (typeof o.USE_OPENAI_REALTIME_FOR_LITE !== "boolean") return false;
  if (typeof o.USE_TRUE_LITE !== "boolean") return false;
  if (typeof o.OPENAI_REALTIME_API_KEY !== "string") return false;
  if (typeof o.OPENAI_REALTIME_SECRET_ID !== "string") return false;
  if (typeof o.OPENAI_REALTIME_PROMPT_ID !== "string") return false;
  if (typeof o.OPENAI_REALTIME_MODEL !== "string") return false;
  if (typeof o.OPENAI_REALTIME_VOICE !== "string") return false;
  if (typeof o.OPENAI_REALTIME_TEMPERATURE !== "number") return false;
  if (typeof o.OPENAI_REALTIME_INSTRUCTIONS !== "string") return false;
  if (typeof o.USE_IARA !== "boolean") return false;
  if (typeof o.IARA_WS_URL !== "string") return false;
  if (typeof o.IARA_API_URL !== "string") return false;
  if (typeof o.IARA_SYSTEM_PROMPT !== "string") return false;
  if (typeof o.IARA_PRESET_ID !== "string") return false;
  if (typeof o.USE_AVATAR_AEC !== "boolean") return false;
  if (typeof o.IARA_VAD_ENGINE !== "string") return false;
  if (typeof o.SILERO_VAD_MODEL !== "string") return false;
  if (typeof o.IARA_VAD_RMS_THRESHOLD !== "number") return false;
  if (typeof o.IARA_VAD_HANGOVER_MS !== "number") return false;
  if (typeof o.IARA_VAD_LISTENING_HOLD_MS !== "number") return false;
  if (typeof o.IARA_VAD_MIN_SPEECH_MS !== "number") return false;
  if (typeof o.SILERO_VAD_POSITIVE_SPEECH_THRESHOLD !== "number") return false;
  if (typeof o.SILERO_VAD_NEGATIVE_SPEECH_THRESHOLD !== "number") return false;
  if (typeof o.SILERO_VAD_REDEMPTION_MS !== "number") return false;
  if (typeof o.SILERO_VAD_PRE_SPEECH_PAD_MS !== "number") return false;
  if (typeof o.IARA_VOICE_API_MIN_BUFFER_MS !== "number") return false;
  if (typeof o.IARA_WS_MIN_APPEND_MS !== "number") return false;
  if (typeof o.OPENAI_REALTIME_VAD_THRESHOLD !== "number") return false;
  if (typeof o.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS !== "number") return false;
  if (typeof o.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS !== "number")
    return false;
  return true;
}

export async function GET() {
  const config = getConfig();
  return Response.json(config);
}

function persistConfig(body: Config): Config {
  if (!body.IS_SANDBOX) return body;
  return { ...body, AVATAR_ID: SANDBOX_AVATAR_ID };
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Config cannot be updated in production" },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateBody(body)) {
    return Response.json(
      {
        error:
          "Invalid config: all fields must be present (strings, IS_SANDBOX boolean)",
      },
      { status: 400 },
    );
  }
  const configPath = getConfigWritePath();
  const dir = path.dirname(configPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const toWrite = persistConfig(body);
    const tmpPath = `${configPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(toWrite, null, 2), "utf-8");
    fs.renameSync(tmpPath, configPath);
  } catch (err) {
    console.error("Failed to write config:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  return Response.json({ success: true });
}
