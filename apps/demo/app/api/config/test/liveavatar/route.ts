import { NextRequest } from "next/server";
import { avatarIdForSandboxMode } from "../../../../../src/config/sandboxAvatar";
import { getConfig } from "../../../secrets";

export async function POST(request: NextRequest) {
  const config = getConfig();
  let apiKey = config.API_KEY;
  let apiUrl = config.API_URL;
  let avatarId = config.AVATAR_ID;
  let isSandbox = config.IS_SANDBOX;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.API_KEY === "string") apiKey = body.API_KEY;
    if (typeof body.API_URL === "string") apiUrl = body.API_URL;
    if (typeof body.AVATAR_ID === "string") avatarId = body.AVATAR_ID;
    if (typeof body.IS_SANDBOX === "boolean") isSandbox = body.IS_SANDBOX;
  } catch {
    // use config
  }
  const trimmedKey = apiKey?.trim() ?? "";
  if (!trimmedKey) {
    return Response.json(
      { success: false, error: "API Key is empty" },
      { status: 400 },
    );
  }
  const trimmedAvatarId = avatarIdForSandboxMode(
    isSandbox,
    avatarId?.trim() ?? "",
  );
  if (!trimmedAvatarId) {
    return Response.json(
      {
        success: false,
        error:
          "Avatar ID is required for testing. Set it in the form above (must be a valid UUID).",
      },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(`${apiUrl}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": trimmedKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: trimmedAvatarId,
        is_sandbox: isSandbox,
      }),
    });
    if (res.ok) {
      return Response.json({ success: true });
    }
    const data = await res.json().catch(() => ({}));
    const msg =
      data?.error ??
      data?.data?.[0]?.message ??
      data?.message ??
      `HTTP ${res.status}`;
    return Response.json(
      { success: false, error: String(msg) },
      { status: 200 },
    );
  } catch (e) {
    return Response.json(
      { success: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
