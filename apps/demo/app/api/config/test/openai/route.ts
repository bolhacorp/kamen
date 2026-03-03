import { NextRequest } from "next/server";
import { getConfig } from "../../../secrets";

export async function POST(request: NextRequest) {
  let apiKey = getConfig().OPENAI_API_KEY;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.OPENAI_API_KEY === "string") apiKey = body.OPENAI_API_KEY;
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
