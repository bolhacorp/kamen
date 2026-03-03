import { NextRequest } from "next/server";
import { getConfig } from "../../../secrets";

/** Test FULL mode: request a session token with current or provided config. */
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!config.USE_FULL_MODE) {
    return Response.json(
      {
        success: false,
        error: "Full mode is turned off. Enable it in Settings to test.",
      },
      { status: 400 },
    );
  }
  let apiKey = config.API_KEY;
  let apiUrl = config.API_URL;
  let avatarId = config.AVATAR_ID;
  let voiceId = config.VOICE_ID;
  let contextId = config.CONTEXT_ID;
  let language = config.LANGUAGE;
  let isSandbox = config.IS_SANDBOX;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.API_KEY === "string") apiKey = body.API_KEY;
    if (typeof body.API_URL === "string") apiUrl = body.API_URL;
    if (typeof body.AVATAR_ID === "string") avatarId = body.AVATAR_ID;
    if (typeof body.VOICE_ID === "string") voiceId = body.VOICE_ID;
    if (typeof body.CONTEXT_ID === "string") contextId = body.CONTEXT_ID;
    if (typeof body.LANGUAGE === "string") language = body.LANGUAGE;
    if (typeof body.IS_SANDBOX === "boolean") isSandbox = body.IS_SANDBOX;
  } catch {
    // use config
  }
  const trimmedKey = (apiKey ?? "").trim();
  const trimmedAvatarId = (avatarId ?? "").trim();
  const trimmedVoiceId = (voiceId ?? "").trim();
  const trimmedContextId = (contextId ?? "").trim();
  const lang = (language ?? "").trim() || "en";

  if (!trimmedKey) {
    return Response.json(
      { success: false, error: "API Key is empty" },
      { status: 400 },
    );
  }
  if (!trimmedAvatarId) {
    return Response.json(
      {
        success: false,
        error: "Avatar ID is required (must be a valid UUID).",
      },
      { status: 400 },
    );
  }
  if (!trimmedVoiceId || !trimmedContextId) {
    return Response.json(
      {
        success: false,
        error: "Voice ID and Context ID are both required for FULL mode.",
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `${(apiUrl ?? "").trim() || "https://api.liveavatar.com"}/v1/sessions/token`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": trimmedKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "FULL",
          avatar_id: trimmedAvatarId,
          avatar_persona: {
            voice_id: trimmedVoiceId,
            context_id: trimmedContextId,
            language: lang,
          },
          is_sandbox: isSandbox,
        }),
      },
    );
    if (res.ok) {
      return Response.json({ success: true });
    }
    const data = await res.json().catch(() => ({}));
    const msg =
      data?.error ??
      data?.data?.[0]?.message ??
      data?.message ??
      `HTTP ${res.status}`;
    return Response.json(
      { success: false, error: String(msg) },
      { status: 200 },
    );
  } catch (e) {
    return Response.json(
      { success: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
