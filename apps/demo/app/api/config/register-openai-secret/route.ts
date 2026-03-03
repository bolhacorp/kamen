import { NextRequest } from "next/server";
import { getConfig } from "../../secrets";

/**
 * Register OPENAI_API_KEY with LiveAvatar as a secret (POST /v1/secrets).
 * Returns secret_id for use in openai_realtime_config.
 * Body: { OPENAI_API_KEY: string, secret_name?: string }
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Cannot register secret in production" },
      { status: 403 },
    );
  }
  const config = getConfig();
  const apiKey = (config.API_KEY ?? "").trim();
  const apiUrl = (config.API_URL ?? "").trim() || "https://api.liveavatar.com";
  if (!apiKey) {
    return Response.json(
      { error: "LiveAvatar API Key not configured" },
      { status: 400 },
    );
  }
  let body: {
    OPENAI_API_KEY?: string;
    OPENAI_REALTIME_API_KEY?: string;
    secret_name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const openaiKey = (
    body.OPENAI_REALTIME_API_KEY ??
    body.OPENAI_API_KEY ??
    ""
  ).trim();
  if (!openaiKey) {
    return Response.json(
      {
        error: "OPENAI_API_KEY or OPENAI_REALTIME_API_KEY is required in body",
      },
      { status: 400 },
    );
  }
  const secretName = (body.secret_name ?? "").trim() || "OpenAI Realtime";
  try {
    const res = await fetch(`${apiUrl}/v1/secrets`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret_type: "OPENAI_API_KEY",
        secret_value: openaiKey,
        secret_name: secretName,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: text?.slice(0, 300) || `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    const secretId = data?.data?.id ?? data?.id;
    if (!secretId) {
      return Response.json(
        { error: "LiveAvatar did not return secret id" },
        { status: 500 },
      );
    }
    return Response.json({ secret_id: secretId });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
