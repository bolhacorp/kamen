import { getConfig } from "../../secrets";

/** Voices accepted by OpenAI Realtime client_secrets (subset of TTS/Realtime; nova/fable/onyx not supported here). */
const OPENAI_REALTIME_ALLOWED_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

function getAllowedVoice(
  configured: string,
): (typeof OPENAI_REALTIME_ALLOWED_VOICES)[number] {
  const v = configured.trim().toLowerCase();
  if (
    OPENAI_REALTIME_ALLOWED_VOICES.includes(
      v as (typeof OPENAI_REALTIME_ALLOWED_VOICES)[number],
    )
  ) {
    return v as (typeof OPENAI_REALTIME_ALLOWED_VOICES)[number];
  }
  return "marin";
}

/**
 * POST /api/realtime/ephemeral-key
 * Returns an OpenAI Realtime client secret (ephemeral key) for True LITE.
 * Keys expire after 1 minute; client should request immediately before connecting.
 * Only allowed when USE_TRUE_LITE is enabled and OpenAI API key is set.
 */
export async function POST() {
  const config = getConfig();
  if (!config.USE_TRUE_LITE) {
    return Response.json(
      { error: "True LITE is not enabled. Enable it in Settings (/config)." },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const apiKey = (
    (config.OPENAI_REALTIME_API_KEY?.trim() ||
      config.OPENAI_API_KEY?.trim() ||
      "") as string
  ).trim();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "OpenAI API key is required for True LITE. Set it in Settings (/config).",
      },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const model = (config.OPENAI_REALTIME_MODEL ?? "gpt-realtime").trim();
  const voice = getAllowedVoice(config.OPENAI_REALTIME_VOICE ?? "marin");
  const instructions = (config.OPENAI_REALTIME_INSTRUCTIONS ?? "").trim();
  const promptId = (config.OPENAI_REALTIME_PROMPT_ID ?? "").trim();

  // Session config per OpenAI API: type realtime, audio input/output PCM 24kHz, turn_detection so the model
  // auto-responds when user stops speaking, instructions, optional prompt.id.
  // Voice must be one of the allowed Realtime voices (nova/fable/onyx are not supported by client_secrets).
  const session: Record<string, unknown> = {
    type: "realtime",
    model: model || "gpt-realtime",
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
      output: {
        format: { type: "audio/pcm", rate: 24000 },
        voice,
      },
    },
  };
  if (instructions) session.instructions = instructions;
  if (promptId) session.prompt = { id: promptId };

  try {
    const res = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session }),
      },
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message =
        (errBody as { error?: { message?: string } })?.error?.message ??
        res.statusText;
      return Response.json(
        { error: message || "Failed to create ephemeral key" },
        { status: res.status, headers: { "Content-Type": "application/json" } },
      );
    }
    const data = (await res.json()) as { value?: string };
    const value = data.value;
    if (!value) {
      return Response.json(
        { error: "No ephemeral key in response" },
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    return Response.json(
      { value, model: session.model, voice },
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
