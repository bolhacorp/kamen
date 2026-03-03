import { getConfig } from "../../secrets";

/**
 * Fetch available OpenAI models and return those that support Realtime API.
 * Uses OPENAI_REALTIME_API_KEY or OPENAI_API_KEY from config.
 * GET /v1/models, then filter by id containing "realtime".
 */
export async function GET() {
  const config = getConfig();
  const apiKey =
    (config.OPENAI_REALTIME_API_KEY ?? "").trim() ||
    (config.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return Response.json({ models: [] });
  }
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      return Response.json({ models: [] });
    }
    const data = (await res.json()) as {
      data?: {
        id: string;
        created?: number;
        object?: string;
        owned_by?: string;
      }[];
    };
    const all = data?.data ?? [];
    const realtime = all
      .filter((m) => m.id?.toLowerCase().includes("realtime"))
      .map((m) => ({ id: m.id, created: m.created ?? 0 }))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    return Response.json({ models: realtime });
  } catch {
    return Response.json({ models: [] });
  }
}
