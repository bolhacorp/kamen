import { getConfig } from "../../../secrets";

/**
 * List LiveAvatar secrets (OPENAI_API_KEY only) for the Realtime secret dropdown.
 * GET /v1/secrets, then filter by secret_type === "OPENAI_API_KEY".
 */
export async function GET() {
  const config = getConfig();
  const apiKey = (config.API_KEY ?? "").trim();
  const apiUrl = (config.API_URL ?? "").trim() || "https://api.liveavatar.com";
  if (!apiKey) {
    return Response.json({ error: "API Key not configured" }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiUrl}/v1/secrets`, {
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
    const list = data?.data ?? (Array.isArray(data) ? data : []);
    const items = Array.isArray(list) ? list : (list?.results ?? []);
    const secrets = items
      .filter(
        (s: { secret_type?: string }) => s.secret_type === "OPENAI_API_KEY",
      )
      .map((s: { id: string; secret_name?: string; secret_type?: string }) => ({
        id: s.id,
        secret_name: s.secret_name ?? s.id,
        secret_type: s.secret_type ?? "OPENAI_API_KEY",
      }));
    return Response.json({ secrets });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
