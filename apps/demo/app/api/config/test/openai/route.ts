import { NextRequest } from "next/server";
import { getConfig } from "../../../secrets";

export async function POST(request: NextRequest) {
  const c = getConfig();
  let apiKey = (c.OPENAI_REALTIME_API_KEY ?? c.OPENAI_API_KEY ?? "").trim();
  try {
    const body = await request.json().catch(() => ({}));
    const fromBody =
      (typeof body.OPENAI_REALTIME_API_KEY === "string"
        ? body.OPENAI_REALTIME_API_KEY
        : null) ??
      (typeof body.OPENAI_API_KEY === "string" ? body.OPENAI_API_KEY : null);
    if (fromBody) apiKey = fromBody.trim();
  } catch {
    // use config
  }
  if (!apiKey?.trim()) {
    return Response.json(
      { success: false, error: "OpenAI API Key is empty" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      return Response.json({ success: true });
    }
    const text = await res.text();
    const msg = text?.slice(0, 200) || `HTTP ${res.status}`;
    return Response.json({ success: false, error: msg }, { status: 200 });
  } catch (e) {
    return Response.json(
      { success: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
