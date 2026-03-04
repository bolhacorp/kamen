import { NextRequest } from "next/server";
import { getConfig } from "../../../secrets";

/** ~0.5 s of PCM 24 kHz 16-bit mono for a minimal test request. */
const TEST_PCM_BYTES = 24_000 * 2 * 0.5; // 24_000

export async function POST(request: NextRequest) {
  const config = getConfig();
  let baseUrl = (config.IARA_API_URL ?? "").trim();
  let systemPrompt = (config.IARA_SYSTEM_PROMPT ?? "").trim();
  let presetId = (config.IARA_PRESET_ID ?? "").trim();

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.IARA_API_URL === "string")
      baseUrl = body.IARA_API_URL.trim();
    if (typeof body.IARA_SYSTEM_PROMPT === "string")
      systemPrompt = body.IARA_SYSTEM_PROMPT.trim();
    if (typeof body.IARA_PRESET_ID === "string")
      presetId = body.IARA_PRESET_ID.trim();
  } catch {
    // use config
  }

  if (!baseUrl) {
    return Response.json(
      { success: false, error: "Voice API URL (IARA_API_URL) is empty" },
      { status: 400 },
    );
  }

  const normalizedUrl = baseUrl.replace(/\/$/, "");
  const url = normalizedUrl.endsWith("/api/voice")
    ? normalizedUrl
    : normalizedUrl + "/api/voice";
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  if (systemPrompt) headers["X-System-Prompt"] = systemPrompt;
  if (presetId) headers["X-Preset-Id"] = presetId;

  // Minimal PCM payload (silence)
  const pcm = new Uint8Array(TEST_PCM_BYTES);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: pcm,
    });

    const resBody = await res.arrayBuffer();
    const text = new TextDecoder().decode(resBody);

    if (res.ok) {
      const turnId = res.headers.get("X-Turn-Id");
      return Response.json({
        success: true,
        message: "Voice API responded with PCM",
        detail: { status: res.status, hasTurnId: !!turnId },
      });
    }

    return Response.json(
      {
        success: false,
        error: `Voice API returned ${res.status}`,
        status: res.status,
        detail: text?.slice(0, 400) || res.statusText,
      },
      { status: 200 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { success: false, error: "Request failed", detail: message },
      { status: 200 },
    );
  }
}
