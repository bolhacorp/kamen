import { NextRequest } from "next/server";
import { getConfig } from "../../secrets";

/** 30 s of PCM 24 kHz 16-bit mono. Match iara ORCHESTRATOR_VOICE_API_MAX_PCM_BYTES. */
const DEFAULT_MAX_PCM_BYTES = 24_000 * 2 * 30; // 1_440_000
const IARA_HEADER_PREFIX = "x-iara-";

function copyTraceHeaders(from: Headers, to: Headers) {
  for (const [key, value] of from.entries()) {
    const k = key.toLowerCase();
    if (k === "x-turn-id" || k.startsWith(IARA_HEADER_PREFIX)) {
      to.set(key, value);
    }
  }
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  const baseUrl = (config.IARA_API_URL ?? "").trim();
  if (!baseUrl) {
    return new Response(
      JSON.stringify({ error: "IARA_API_URL is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const maxBytes = DEFAULT_MAX_PCM_BYTES;
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return new Response(
      JSON.stringify({ error: "Empty body; send PCM audio" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (body.byteLength > maxBytes) {
    return new Response(
      JSON.stringify({
        error: `Body too large (max ${maxBytes} bytes, got ${body.byteLength})`,
      }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const normalizedUrl = baseUrl.replace(/\/$/, "");
  const url = normalizedUrl.endsWith("/api/voice")
    ? normalizedUrl
    : normalizedUrl + "/api/voice";
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  const systemPrompt = (config.IARA_SYSTEM_PROMPT ?? "").trim();
  if (systemPrompt) headers["X-System-Prompt"] = systemPrompt;
  const presetId = (config.IARA_PRESET_ID ?? "").trim();
  if (presetId) headers["X-Preset-Id"] = presetId;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    const resBody = await res.arrayBuffer();
    const responseHeaders = new Headers();
    copyTraceHeaders(res.headers, responseHeaders);

    if (!res.ok) {
      const text = new TextDecoder().decode(resBody);
      responseHeaders.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({
          error: `iara voice API error (${res.status})`,
          detail: text?.slice(0, 500) || res.statusText,
        }),
        {
          status: res.status === 413 ? 413 : res.status === 404 ? 404 : 502,
          headers: responseHeaders,
        },
      );
    }

    responseHeaders.set("Content-Type", "application/octet-stream");
    return new Response(resBody, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({
        error: "iara voice API request failed",
        detail: message,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
