import { NextRequest } from "next/server";
import { getConfig } from "../../../secrets";

type WsLike = {
  readyState: number;
  send: (data: string | ArrayBuffer) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onclose:
    | ((ev?: { code?: number; reason?: string; wasClean?: boolean }) => void)
    | null;
};

const DEFAULT_TIMEOUT_MS = 5000;

function closeWs(ws: WsLike | null | undefined) {
  try {
    ws?.close();
  } catch {
    // ignore
  }
}

function resolveIaraVoiceWsUrl(iaraWsUrl: string, iaraApiUrl: string): string {
  const direct = iaraWsUrl.trim();
  if (direct) return direct;
  const api = iaraApiUrl.trim();
  if (!api) return "";
  const noTrailing = api.replace(/\/$/, "");
  if (noTrailing.endsWith("/api/voice/ws")) return noTrailing;
  if (noTrailing.endsWith("/api/voice")) {
    const base = noTrailing.slice(0, -"/api/voice".length);
    return base.replace(/^http(s?):\/\//, "ws$1://") + "/api/voice/ws";
  }
  return noTrailing.replace(/^http(s?):\/\//, "ws$1://") + "/api/voice/ws";
}

function makeTestTonePcm(): Uint8Array {
  const sampleRate = 24_000;
  const durationSec = 0.35;
  const samples = Math.floor(sampleRate * durationSec);
  const out = new Uint8Array(samples * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const s = Math.sin(2 * Math.PI * 440 * t) * 0.2;
    view.setInt16(i * 2, Math.round(s * 0x7fff), true);
  }
  return out;
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  let iaraWsUrl = (config.IARA_WS_URL ?? "").trim();
  let iaraApiUrl = (config.IARA_API_URL ?? "").trim();
  let iaraSystemPrompt = (config.IARA_SYSTEM_PROMPT ?? "").trim();
  let iaraPresetId = (config.IARA_PRESET_ID ?? "").trim();

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.IARA_WS_URL === "string")
      iaraWsUrl = body.IARA_WS_URL.trim();
    if (typeof body.IARA_API_URL === "string")
      iaraApiUrl = body.IARA_API_URL.trim();
    if (typeof body.IARA_SYSTEM_PROMPT === "string")
      iaraSystemPrompt = body.IARA_SYSTEM_PROMPT.trim();
    if (typeof body.IARA_PRESET_ID === "string")
      iaraPresetId = body.IARA_PRESET_ID.trim();
  } catch {
    // use config
  }

  const resolvedWsUrl = resolveIaraVoiceWsUrl(iaraWsUrl, iaraApiUrl);

  if (!resolvedWsUrl) {
    return Response.json(
      { success: false, error: "iara WebSocket URL/API URL is empty" },
      { status: 400 },
    );
  }

  const WS = (globalThis as unknown as { WebSocket?: typeof WebSocket })
    .WebSocket;
  if (!WS) {
    return Response.json(
      {
        success: false,
        error:
          "Server WebSocket client is not available in this runtime. Use the browser test instead.",
      },
      { status: 200 },
    );
  }

  const sessionId = `cfg-${Date.now()}`;
  const pcm = makeTestTonePcm();
  const commit: Record<string, unknown> = {
    type: "turn.commit",
    session_id: sessionId,
  };
  if (iaraSystemPrompt) commit.system_prompt = iaraSystemPrompt;
  if (iaraPresetId) commit.preset_id = iaraPresetId;

  let ws: WsLike | null = null;

  try {
    const result = await new Promise<{
      ok: boolean;
      error?: string;
      closeCode?: number;
      closeReason?: string;
      wasClean?: boolean;
      lastTextFrame?: string | null;
    }>((resolve) => {
      let done = false;
      let lastTextFrame: string | null = null;
      let closeCode: number | undefined;
      let closeReason: string | undefined;
      let wasClean: boolean | undefined;
      const finish = (ok: boolean, error?: string) => {
        if (done) return;
        done = true;
        resolve({
          ok,
          error,
          closeCode,
          closeReason,
          wasClean,
          lastTextFrame,
        });
      };

      const timeout = setTimeout(() => {
        closeWs(ws);
        finish(false, `Timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }, DEFAULT_TIMEOUT_MS);

      ws = new (WS as unknown as new (url: string) => WsLike)(resolvedWsUrl);

      ws.onopen = () => {
        try {
          ws?.send(pcm.buffer);
          ws?.send(JSON.stringify(commit));
        } catch (e) {
          clearTimeout(timeout);
          finish(false, (e as Error).message);
        }
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        lastTextFrame = ev.data;
        try {
          const data = JSON.parse(ev.data) as {
            type?: string;
            message?: string;
            code?: string;
          };
          if (
            data?.type === "turn.started" ||
            data?.type === "stt.final" ||
            data?.type === "tts.audio" ||
            data?.type === "turn.completed" ||
            data?.type === "session_ready"
          ) {
            clearTimeout(timeout);
            closeWs(ws);
            finish(true);
          } else if (data?.type === "error") {
            clearTimeout(timeout);
            const msg = data?.message ?? "Unknown iara error";
            const code = data?.code ? ` (${data.code})` : "";
            closeWs(ws);
            finish(false, `${msg}${code}`);
          }
        } catch {
          // ignore non-json
        }
      };

      ws.onerror = () => {
        // handled by timeout/close
      };

      ws.onclose = (ev) => {
        closeCode = ev?.code;
        closeReason = ev?.reason;
        wasClean = ev?.wasClean;
        clearTimeout(timeout);
        finish(false, "WebSocket closed before receiving turn events");
      };
    });

    if (result.ok) {
      return Response.json({
        success: true,
        detail: {
          url: resolvedWsUrl,
          sessionId,
          commit,
          closeCode: result.closeCode,
          closeReason: result.closeReason,
          wasClean: result.wasClean,
        },
      });
    }
    return Response.json(
      {
        success: false,
        error: result.error ?? "Failed to connect",
        detail: {
          url: resolvedWsUrl,
          sessionId,
          commit,
          closeCode: result.closeCode,
          closeReason: result.closeReason,
          wasClean: result.wasClean,
          lastTextFrame: result.lastTextFrame,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    return Response.json(
      { success: false, error: (e as Error).message },
      { status: 200 },
    );
  } finally {
    closeWs(ws);
  }
}
