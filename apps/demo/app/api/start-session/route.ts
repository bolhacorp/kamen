import { NextRequest } from "next/server";
import { getConfig } from "../secrets";

interface StartFullModeSessionRequestBody {
  pushToTalk?: boolean;
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!config.USE_FULL_MODE) {
    return new Response(
      JSON.stringify({
        error:
          "Full mode is turned off. Enable “Use Full mode” in Settings (/config) to use LiveAvatar voice & context.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const apiKey = (config.API_KEY ?? "").trim();
  const avatarId = (config.AVATAR_ID ?? "").trim();
  const voiceId = (config.VOICE_ID ?? "").trim();
  const contextId = (config.CONTEXT_ID ?? "").trim();
  const language = (config.LANGUAGE ?? "").trim() || "en";

  if (!voiceId || !contextId) {
    return new Response(
      JSON.stringify({
        error:
          "FULL mode requires Voice ID and Context ID. Set them in Settings (/config) under “FULL mode (voice & context)”. " +
          `(Server read: voice_id length ${voiceId.length}, context_id length ${contextId.length}. If you set them, re-save in Settings.)`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let session_token = "";
  let session_id = "";
  try {
    const body: StartFullModeSessionRequestBody = await request
      .json()
      .catch(() => ({}));
    const pushToTalk = body.pushToTalk === true;
    const res = await fetch(`${config.API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "FULL",
        avatar_id: avatarId,
        avatar_persona: {
          voice_id: voiceId,
          context_id: contextId,
          language,
        },
        ...(pushToTalk && { interactivity_type: "PUSH_TO_TALK" }),
        is_sandbox: config.IS_SANDBOX,
      }),
    });

    if (!res.ok) {
      // Check if response is JSON before parsing
      const contentType = res.headers.get("content-type");
      let errorMessage = "Failed to retrieve session token";

      if (contentType && contentType.includes("application/json")) {
        try {
          const resp = await res.json();
          if (resp.data && resp.data.length > 0) {
            errorMessage = resp.data[0].message;
          } else if (resp.error) {
            errorMessage = resp.error;
          } else if (resp.message) {
            errorMessage = resp.message;
          }
        } catch (e) {
          console.error("Failed to parse error response:", e);
        }
      } else {
        const text = await res.text();
        if (text)
          errorMessage = text.length > 200 ? text.slice(0, 200) + "…" : text;
        if (process.env.NODE_ENV === "development") {
          console.error(
            "Session start error response (text):",
            text?.slice(0, 500),
          );
        }
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
      });
    }

    const data = await res.json();

    session_token = data.data.session_token;
    session_id = data.data.session_id;
  } catch (error) {
    console.error("Error retrieving session token:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }

  if (!session_token) {
    return new Response("Failed to retrieve session token", {
      status: 500,
    });
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
