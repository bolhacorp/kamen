/**
 * @deprecated Use POST /api/session/start instead (unified session start for FULL, LITE, and LITE_TRUE).
 */
import { getConfig } from "../secrets";

const OPENAI_REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "sage",
  "verse",
  "marin",
  "cedar",
] as const;

export async function POST() {
  const config = getConfig();
  let session_token = "";
  let session_id = "";

  const useRealtime =
    config.USE_OPENAI_REALTIME_FOR_LITE &&
    (config.OPENAI_REALTIME_SECRET_ID ?? "").trim().length > 0;

  if (config.USE_OPENAI_REALTIME_FOR_LITE && !useRealtime) {
    return new Response(
      JSON.stringify({
        error:
          "OpenAI Realtime is enabled but no secret is registered. In Settings (/config), enter your OpenAI API key (for Realtime) and click Register, then save.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const apiKey = config.API_KEY.trim();
    const avatarId = config.AVATAR_ID.trim();
    const body: {
      mode: "LITE";
      avatar_id: string;
      is_sandbox: boolean;
      openai_realtime_config?: {
        secret_id: string;
        voice?: string;
        model?: string;
        temperature?: number;
        instructions?: string;
      };
    } = {
      mode: "LITE",
      avatar_id: avatarId,
      is_sandbox: config.IS_SANDBOX,
    };

    if (useRealtime) {
      const secretId = config.OPENAI_REALTIME_SECRET_ID.trim();
      const model = (config.OPENAI_REALTIME_MODEL ?? "gpt-realtime").trim();
      const voice = (config.OPENAI_REALTIME_VOICE ?? "marin").trim();
      const temperature = config.OPENAI_REALTIME_TEMPERATURE ?? 0.8;
      const instructions = (config.OPENAI_REALTIME_INSTRUCTIONS ?? "").trim();
      body.openai_realtime_config = {
        secret_id: secretId,
        model: model || undefined,
        voice: OPENAI_REALTIME_VOICES.includes(
          voice as (typeof OPENAI_REALTIME_VOICES)[number],
        )
          ? voice
          : undefined,
        temperature:
          typeof temperature === "number" &&
          temperature >= 0.6 &&
          temperature <= 1.2
            ? temperature
            : undefined,
        ...(instructions ? { instructions } : {}),
      };
      if (body.openai_realtime_config.voice === undefined)
        delete body.openai_realtime_config.voice;
      if (body.openai_realtime_config.model === undefined)
        delete body.openai_realtime_config.model;
      if (body.openai_realtime_config.temperature === undefined)
        delete body.openai_realtime_config.temperature;
    }

    const res = await fetch(`${config.API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errorMessage =
        errBody?.data?.[0]?.message ??
        errBody?.error ??
        errBody?.message ??
        "Failed to retrieve session token";
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    session_token = data.data.session_token;
    session_id = data.data.session_id;
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }

  if (!session_token) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve session token" }),
      {
        status: 500,
      },
    );
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
