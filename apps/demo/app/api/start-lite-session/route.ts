import { getConfig } from "../secrets";

export async function POST() {
  const config = getConfig();
  let session_token = "";
  let session_id = "";
  try {
    const apiKey = config.API_KEY.trim();
    const avatarId = config.AVATAR_ID.trim();
    const res = await fetch(`${config.API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: avatarId,
        is_sandbox: config.IS_SANDBOX,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errorMessage =
        errBody?.data?.[0]?.message ??
        errBody?.error ??
        errBody?.message ??
        "Failed to retrieve session token";
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    session_token = data.data.session_token;
    session_id = data.data.session_id;
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }

  if (!session_token) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve session token" }),
      {
        status: 500,
      },
    );
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
