import { getConfig, normalizeUseAvatarAec } from "../../secrets";

/**
 * GET /api/config/summary
 * Returns a non-sensitive overview for the main page: mode, readiness, what will start.
 * No API keys or secrets in the response.
 */
export async function GET() {
  const config = getConfig();
  const apiKey = (config.API_KEY ?? "").trim();
  const avatarId = (config.AVATAR_ID ?? "").trim();
  const voiceId = (config.VOICE_ID ?? "").trim();
  const contextId = (config.CONTEXT_ID ?? "").trim();

  const fullReady =
    config.USE_FULL_MODE &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    voiceId.length > 0 &&
    contextId.length > 0;

  const openaiKey = (
    (config.OPENAI_REALTIME_API_KEY?.trim() ||
      config.OPENAI_API_KEY?.trim() ||
      "") as string
  ).trim();
  const trueLiteReady =
    config.USE_TRUE_LITE &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    openaiKey.length > 0;

  const iaraWsUrl = (config.IARA_WS_URL ?? "").trim();
  const iaraApiUrl = (config.IARA_API_URL ?? "").trim();
  const iaraReady =
    config.USE_IARA &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    (iaraWsUrl.length > 0 || iaraApiUrl.length > 0);

  const liteRealtimeReady =
    config.USE_OPENAI_REALTIME_FOR_LITE &&
    apiKey.length > 0 &&
    avatarId.length > 0 &&
    (config.OPENAI_REALTIME_SECRET_ID ?? "").trim().length > 0;

  const liteReady = liteRealtimeReady;

  const liteProvider: "openai_realtime" | "true_lite" | "iara" | null =
    trueLiteReady
      ? "true_lite"
      : iaraReady
        ? "iara"
        : liteRealtimeReady
          ? "openai_realtime"
          : null;

  let startMode:
    | "FULL"
    | "FULL_PTT"
    | "LITE"
    | "LITE_TRUE"
    | "LITE_IARA"
    | null = null;
  let error: string | null = null;

  if (fullReady) {
    startMode = config.USE_PUSH_TO_TALK_FOR_FULL ? "FULL_PTT" : "FULL";
  } else if (trueLiteReady) {
    startMode = "LITE_TRUE";
  } else if (iaraReady) {
    startMode = "LITE_IARA";
  } else if (liteReady) {
    startMode = "LITE";
  } else {
    if (config.USE_FULL_MODE) {
      if (!apiKey || !avatarId)
        error = "Set LiveAvatar API key and Avatar ID in Settings.";
      else if (!voiceId || !contextId)
        error =
          "Full mode requires Voice ID and Context ID in Settings (FULL mode section).";
    } else if (config.USE_TRUE_LITE) {
      if (!apiKey || !avatarId)
        error = "Set LiveAvatar API key and Avatar ID in Settings.";
      else if (!openaiKey)
        error =
          "True LITE: set OpenAI API key in Settings (for ephemeral key).";
    } else if (config.USE_IARA) {
      if (!apiKey || !avatarId)
        error = "Set LiveAvatar API key and Avatar ID in Settings.";
      else if (!iaraWsUrl && !iaraApiUrl)
        error = "iara: set WebSocket URL or Voice API URL in Settings.";
    } else if (config.USE_OPENAI_REALTIME_FOR_LITE) {
      if (!apiKey || !avatarId)
        error = "Set LiveAvatar API key and Avatar ID in Settings.";
      else if (!(config.OPENAI_REALTIME_SECRET_ID ?? "").trim())
        error =
          "LITE: register your OpenAI key in Settings (OpenAI Realtime section) and save.";
    } else {
      error =
        "Enable Full mode, True LITE, iara, or OpenAI Realtime for LITE in Settings.";
    }
  }

  return Response.json({
    fullReady,
    liteReady,
    trueLiteReady,
    iaraReady,
    liteProvider,
    startMode,
    error,
    useFullMode: config.USE_FULL_MODE,
    useLiteRealtime: config.USE_OPENAI_REALTIME_FOR_LITE,
    useTrueLite: config.USE_TRUE_LITE,
    useIara: config.USE_IARA,
    hasApiKey: apiKey.length > 0,
    hasAvatarId: avatarId.length > 0,
    iaraWsUrl: config.USE_IARA ? iaraWsUrl || null : null,
    iaraApiUrl: config.USE_IARA ? iaraApiUrl || null : null,
    avatarAecEnabled: normalizeUseAvatarAec(config.USE_AVATAR_AEC),
  });
}
