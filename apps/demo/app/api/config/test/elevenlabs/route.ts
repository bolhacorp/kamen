import { NextRequest } from "next/server";
import { getConfig } from "../../../secrets";

export async function POST(request: NextRequest) {
  let apiKey = getConfig().ELEVENLABS_API_KEY;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.ELEVENLABS_API_KEY === "string")
      apiKey = body.ELEVENLABS_API_KEY;
  } catch {
    // use config
  }
  if (!apiKey?.trim()) {
    return Response.json(
      { success: false, error: "ElevenLabs API Key is empty" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      method: "GET",
      headers: { "xi-api-key": apiKey },
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
