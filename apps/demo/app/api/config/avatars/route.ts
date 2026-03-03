import { getConfig } from "../../secrets";

/**
 * Fetch available avatars from LiveAvatar API (GET /v1/avatars for user avatars).
 * Used to populate the Avatar ID dropdown on the config page.
 */
export async function GET() {
  const config = getConfig();
  const apiKey = (config.API_KEY ?? "").trim();
  const apiUrl = (config.API_URL ?? "").trim() || "https://api.liveavatar.com";
  if (!apiKey) {
    return Response.json({ error: "API Key not configured" }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiUrl}/v1/avatars?page=1&page_size=100`, {
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
    const avatars = results.map(
      (a: {
        id: string;
        name?: string;
        default_voice?: { id: string; name?: string };
      }) => ({
        id: a.id,
        name: a.name ?? a.id,
        default_voice_id: a.default_voice?.id ?? "",
        default_voice_name: a.default_voice?.name ?? "",
      }),
    );
    return Response.json({ avatars });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
