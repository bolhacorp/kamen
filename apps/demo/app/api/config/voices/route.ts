import { getConfig } from "../../secrets";

/**
 * Fetch available voices from LiveAvatar API (GET /v1/voices).
 * Used to populate the Voice ID dropdown on the config page.
 */
export async function GET() {
  const config = getConfig();
  const apiKey = (config.API_KEY ?? "").trim();
  const apiUrl = (config.API_URL ?? "").trim() || "https://api.liveavatar.com";
  if (!apiKey) {
    return Response.json({ error: "API Key not configured" }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiUrl}/v1/voices?page=1&page_size=100`, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: text?.slice(0, 200) || `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    const results = data?.data?.results ?? [];
    const voices = results.map(
      (v: {
        id: string;
        name?: string;
        language?: string;
        gender?: string;
      }) => ({
        id: v.id,
        name: v.name ?? v.id,
        language: v.language ?? "",
        gender: v.gender ?? "",
      }),
    );
    return Response.json({ voices });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
