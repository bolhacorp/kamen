import { getConfig } from "../../secrets";

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

type StartMode = "FULL" | "FULL_PTT" | "LITE" | "LITE_TRUE";

function getStartMode(config: ReturnType<typeof getConfig>): {
  mode: StartMode | null;
  error: string | null;
} {
  const apiKey = (config.API_KEY ?? "").trim();
  const avatarId = (config.AVATAR_ID ?? "").trim();
  const voiceId = (config.VOICE_ID ?? "").trim();
  const contextId = (config.CONTEXT_ID ?? "").trim();
  const openaiKey = (
    (config.OPENAI_REALTIME_API_KEY?.trim() ||
      config.OPENAI_API_KEY?.trim() ||
      "") as string
  ).trim();

  const fullReady =
    config.USE_FULL_MODE &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    voiceId.length > 0 &&
    contextId.length > 0;

  const trueLiteReady =
    config.USE_TRUE_LITE &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    openaiKey.length > 0;

  const liteRealtimeReady =
    config.USE_OPENAI_REALTIME_FOR_LITE &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    (config.OPENAI_REALTIME_SECRET_ID ?? "").trim().length > 0;

  const liteReady = liteRealtimeReady;

  if (fullReady) {
    return {
      mode: config.USE_PUSH_TO_TALK_FOR_FULL ? "FULL_PTT" : "FULL",
      error: null,
    };
  }
  if (trueLiteReady) {
    return { mode: "LITE_TRUE", error: null };
  }
  if (liteReady) {
    return { mode: "LITE", error: null };
  }
  if (config.USE_FULL_MODE) {
    if (!apiKey || !avatarId)
      return {
        mode: null,
        error: "Set LiveAvatar API key and Avatar ID in Settings (/config).",
      };
    if (!voiceId || !contextId)
      return {
        mode: null,
        error:
          "Full mode requires Voice ID and Context ID in Settings (FULL mode section).",
      };
  } else if (config.USE_TRUE_LITE) {
    if (!apiKey || !avatarId)
      return {
        mode: null,
        error: "Set LiveAvatar API key and Avatar ID in Settings (/config).",
      };
    if (!openaiKey)
      return {
        mode: null,
        error: "True LITE: set OpenAI API key in Settings (for ephemeral key).",
      };
  } else if (config.USE_OPENAI_REALTIME_FOR_LITE) {
    if (!apiKey || !avatarId)
      return {
        mode: null,
        error: "Set LiveAvatar API key and Avatar ID in Settings (/config).",
      };
    if (!(config.OPENAI_REALTIME_SECRET_ID ?? "").trim())
      return {
        mode: null,
        error:
          "LITE: register your OpenAI key in Settings (OpenAI Realtime) and save.",
      };
  }
  return {
    mode: null,
    error:
      "Enable Full mode, True LITE, or OpenAI Realtime for LITE in Settings (/config).",
  };
}

export async function POST() {
  const config = getConfig();
  const { mode, error } = getStartMode(config);
  if (error || !mode) {
    return new Response(
      JSON.stringify({ error: error ?? "Configuration is incomplete." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey = config.API_KEY.trim();
  const avatarId = config.AVATAR_ID.trim();
  const apiUrl = (config.API_URL ?? "").trim() || "https://api.liveavatar.com";

  let session_token = "";
  let session_id = "";

  try {
    if (mode === "FULL" || mode === "FULL_PTT") {
      const voiceId = (config.VOICE_ID ?? "").trim();
      const contextId = (config.CONTEXT_ID ?? "").trim();
      const language = (config.LANGUAGE ?? "").trim() || "en";
      const res = await fetch(`${apiUrl}/v1/sessions/token`, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "FULL",
          avatar_id: avatarId,
          avatar_persona: {
            voice_id: voiceId,
            context_id: contextId,
            language,
          },
          ...(mode === "FULL_PTT" && { interactivity_type: "PUSH_TO_TALK" }),
          is_sandbox: config.IS_SANDBOX,
        }),
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        let errorMessage = "Failed to retrieve session token";
        if (contentType?.includes("application/json")) {
          try {
            const resp = await res.json();
            errorMessage =
              resp.data?.[0]?.message ??
              resp.error ??
              resp.message ??
              errorMessage;
          } catch {
            // keep default
          }
        } else {
          const text = await res.text();
          if (text) errorMessage = text.slice(0, 200);
        }
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      session_token = data.data?.session_token ?? "";
      session_id = data.data?.session_id ?? "";
    } else {
      // LITE or LITE_TRUE: request LiveAvatar token. LITE_TRUE = we manage Realtime (no openai_realtime_config).
      const useRealtime =
        mode === "LITE" &&
        config.USE_OPENAI_REALTIME_FOR_LITE &&
        (config.OPENAI_REALTIME_SECRET_ID ?? "").trim().length > 0;
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
      // LITE_TRUE: body has no openai_realtime_config (we manage Realtime ourselves)
      const res = await fetch(`${apiUrl}/v1/sessions/token`, {
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
      session_token = data.data?.session_token ?? "";
      session_id = data.data?.session_id ?? "";
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!session_token) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve session token" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ session_token, session_id, mode }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
