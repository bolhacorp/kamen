"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LiveAvatarSession } from "./LiveAvatarSession";
import { Header } from "./Header";
import { Loading } from "./Loading";
import { PipelineLogViewer } from "./PipelineLogViewer";
import { SessionInteractivityMode } from "@heygen/liveavatar-web-sdk";
import type { IaraAudioSettings } from "../liveavatar/iaraAudioSettings";
import { logOrchestrator } from "../pipeline-log";

export type SessionMode =
  | "FULL"
  | "FULL_PTT"
  | "LITE"
  | "LITE_TRUE"
  | "LITE_IARA";

type ConfigSummary = {
  fullReady: boolean;
  liteReady: boolean;
  trueLiteReady?: boolean;
  iaraReady?: boolean;
  liteProvider: "openai_realtime" | "true_lite" | "iara" | null;
  startMode: "FULL" | "FULL_PTT" | "LITE" | "LITE_TRUE" | "LITE_IARA" | null;
  error: string | null;
  useFullMode: boolean;
  useLiteRealtime: boolean;
  useTrueLite?: boolean;
  useIara?: boolean;
  hasApiKey: boolean;
  hasAvatarId: boolean;
  iaraWsUrl?: string | null;
  iaraApiUrl?: string | null;
  /** From Settings: USE_AVATAR_AEC (True Lite / iara mic path). */
  avatarAecEnabled?: boolean;
};

async function ensureMicrophoneAccess(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return {
      ok: false,
      error: "Microphone access is not supported in this browser.",
    };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasAudioInput = devices.some((d) => d.kind === "audioinput");
    if (!hasAudioInput) {
      return {
        ok: false,
        error: "No microphone found. Please connect a microphone to start.",
      };
    }
  } catch {
    // enumerateDevices can fail; continue and let getUserMedia be the final check
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (e: unknown) {
    const name = e instanceof Error ? e.name : "";
    const message = e instanceof Error ? e.message : String(e);
    if (
      name === "NotAllowedError" ||
      message.toLowerCase().includes("permission")
    ) {
      return {
        ok: false,
        error:
          "Microphone access was denied. Please allow microphone access to start the avatar.",
      };
    }
    if (
      name === "NotFoundError" ||
      message.toLowerCase().includes("not found")
    ) {
      return {
        ok: false,
        error: "No microphone found. Please connect a microphone to start.",
      };
    }
    return {
      ok: false,
      error:
        "Microphone is not available. Please check your device and try again.",
    };
  }
}

function formatStartMode(mode: ConfigSummary["startMode"]): string {
  if (mode === "FULL") return "Full (voice)";
  if (mode === "FULL_PTT") return "Full (push to talk)";
  if (mode === "LITE") return "Lite (LiveAvatar-managed)";
  if (mode === "LITE_TRUE") return "True Lite";
  if (mode === "LITE_IARA") return "Lite (iara)";
  return "—";
}

function formatLiteProvider(summary: ConfigSummary): string {
  if (summary.liteProvider === "true_lite")
    return "True LITE (we manage Realtime)";
  if (summary.liteProvider === "iara") return "iara (local voice)";
  if (summary.liteProvider === "openai_realtime")
    return "OpenAI Realtime (LiveAvatar-managed)";
  return "—";
}

export const LiveAvatarDemo = ({ apiUrl }: { apiUrl: string }) => {
  const [sessionToken, setSessionToken] = useState("");
  const [mode, setMode] = useState<SessionMode>("FULL");
  const [iaraWsUrl, setIaraWsUrl] = useState("");
  const [iaraApiUrl, setIaraApiUrl] = useState("");
  const [iaraSystemPrompt, setIaraSystemPrompt] = useState("");
  const [iaraPresetId, setIaraPresetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [summary, setSummary] = useState<ConfigSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [micStatus, setMicStatus] = useState<
    "idle" | "checking" | "ok" | "error"
  >("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  /** AEC flag for the active session, from POST /api/session/start (matches saved config at start time). */
  const [sessionAvatarAecEnabled, setSessionAvatarAecEnabled] = useState(false);
  /** iara VAD/streaming snapshot from session start (LITE_IARA). */
  const [sessionIaraAudio, setSessionIaraAudio] =
    useState<IaraAudioSettings | null>(null);

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    logOrchestrator(
      "Fetching config summary (GET /api/config/summary)",
      "info",
    );
    try {
      const res = await fetch("/api/config/summary", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setSummary(data);
      logOrchestrator("Config summary loaded", "info", {
        startMode: data.startMode ?? null,
        error: data.error ?? null,
        fullReady: data.fullReady,
        trueLiteReady: data.trueLiteReady,
        liteProvider: data.liteProvider ?? null,
        avatarAecEnabled: data.avatarAecEnabled === true,
      });
    } catch (e) {
      setSummary(null);
      logOrchestrator("Config summary fetch failed", "error", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshSummary();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshSummary]);

  const checkMic = useCallback(async () => {
    setMicStatus("checking");
    setMicError(null);
    const result = await ensureMicrophoneAccess();
    if (result.ok) {
      setMicStatus("ok");
    } else {
      setMicStatus("error");
      setMicError(result.error);
    }
  }, []);

  const handleStart = async () => {
    setError(null);

    const mic = await ensureMicrophoneAccess();
    if (!mic.ok) {
      setError(mic.error);
      setMicStatus("error");
      setMicError(mic.error);
      logOrchestrator("Start aborted: microphone check failed", "warn", {
        error: mic.error,
      });
      return;
    }
    setMicStatus("ok");

    setIsLoadingToken(true);
    logOrchestrator(
      "Requesting session token (POST /api/session/start)",
      "info",
      {
        expectedModeFromSummary: summary?.startMode ?? null,
      },
    );

    try {
      const res = await fetch("/api/session/start", { method: "POST" });

      const data = (await res.json().catch(() => ({}))) as {
        session_token?: string;
        mode?: string;
        error?: string;
        avatar_aec_enabled?: boolean;
        iara_ws_url?: string;
        iara_api_url?: string;
        iara_system_prompt?: string;
        iara_preset_id?: string;
        iara_audio?: IaraAudioSettings;
      };

      if (!res.ok) {
        setError(data?.error ?? "Failed to start session");
        setIsLoadingToken(false);
        logOrchestrator("Session start failed", "error", {
          status: res.status,
          error: data?.error,
        });
        return;
      }

      const aecFromStart =
        typeof data.avatar_aec_enabled === "boolean"
          ? data.avatar_aec_enabled
          : summary?.avatarAecEnabled === true;
      setSessionAvatarAecEnabled(aecFromStart);
      setSessionToken(data.session_token ?? "");
      const resolvedMode: SessionMode =
        data.mode === "FULL_PTT" ||
        data.mode === "LITE" ||
        data.mode === "LITE_TRUE" ||
        data.mode === "LITE_IARA"
          ? data.mode
          : "FULL";
      setMode(resolvedMode);
      if (resolvedMode === "LITE_IARA") {
        setIaraWsUrl(data.iara_ws_url ?? "");
        setIaraApiUrl(data.iara_api_url ?? "");
        setIaraSystemPrompt(data.iara_system_prompt ?? "");
        setIaraPresetId(data.iara_preset_id ?? "");
        setSessionIaraAudio(data.iara_audio ?? null);
      } else {
        setIaraWsUrl("");
        setIaraApiUrl("");
        setIaraSystemPrompt("");
        setIaraPresetId("");
        setSessionIaraAudio(null);
      }
      setIsLoadingToken(false);
      logOrchestrator("Session token received, starting LiveAvatar", "info", {
        mode: resolvedMode,
        tokenPrefix: (data.session_token ?? "").slice(0, 20) + "…",
      });
    } catch (e: unknown) {
      setError((e as Error).message);
      setIsLoadingToken(false);
      logOrchestrator("Session start request threw", "error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const onSessionStopped = useCallback(() => {
    logOrchestrator("Session stopped (user or disconnect)", "info");
    setSessionToken("");
    setSessionAvatarAecEnabled(false);
    setSessionIaraAudio(null);
  }, []);

  const voiceChatConfig = useMemo(() => {
    if (mode === "LITE_TRUE" || mode === "LITE_IARA") return false; // We send mic to OpenAI/iara only; no voice chat to LiveAvatar
    if (mode === "FULL_PTT") {
      return { mode: SessionInteractivityMode.PUSH_TO_TALK };
    }
    return true;
  }, [mode]);

  const canStart = !summaryLoading;

  return (
    <div className="app-container">
      <button
        type="button"
        onClick={() => setShowLogViewer((prev) => !prev)}
        className="fixed bottom-4 right-4 z-[100] px-4 py-2 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-white text-sm font-medium border border-white/20 shadow-lg"
        title={
          showLogViewer
            ? "Close pipeline log"
            : "Open pipeline log (OpenAI Realtime, LiveAvatar, Orchestrator)"
        }
      >
        Log
      </button>
      {showLogViewer && <PipelineLogViewer />}
      {!sessionToken && !isLoadingToken ? (
        <div className="idle-screen screen-transition">
          <Header />
          <div className="idle-background" />

          {/* Overview */}
          <div className="overview-panel">
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Status
              {summary && (
                <button
                  type="button"
                  onClick={() => refreshSummary()}
                  className="overview-refresh-btn"
                >
                  Refresh
                </button>
              )}
            </div>
            {summaryLoading ? (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                Loading config…
              </p>
            ) : summary ? (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  fontSize: 13,
                }}
              >
                <li style={{ marginBottom: 6 }}>
                  <strong>Mode:</strong>{" "}
                  {summary.startMode
                    ? formatStartMode(summary.startMode)
                    : "Not configured"}
                </li>
                {(summary.startMode === "LITE" ||
                  summary.startMode === "LITE_TRUE" ||
                  summary.startMode === "LITE_IARA") &&
                  summary.liteProvider && (
                    <li style={{ marginBottom: 6 }}>
                      <strong>Lite provider:</strong>{" "}
                      {formatLiteProvider(summary)}
                    </li>
                  )}
                <li style={{ marginBottom: 6 }}>
                  <strong>Microphone:</strong>{" "}
                  {micStatus === "idle" && (
                    <button
                      type="button"
                      onClick={checkMic}
                      style={{
                        background: "rgba(255,255,255,0.15)",
                        border: "none",
                        color: "#fff",
                        padding: "4px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Check
                    </button>
                  )}
                  {micStatus === "checking" && "Checking…"}
                  {micStatus === "ok" && "OK"}
                  {micStatus === "error" && (micError ?? "Error")}
                </li>
                {summary.error && (
                  <li style={{ color: "rgb(248 113 113)", marginTop: 8 }}>
                    {summary.error}
                  </li>
                )}
              </ul>
            ) : (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                Could not load config.{" "}
                <Link href="/config" className="text-blue-300 hover:underline">
                  Open Settings
                </Link>
              </p>
            )}
          </div>

          {error && (
            <div className="error-message">
              {error.startsWith("Microphone") ||
              error.startsWith("No microphone")
                ? error
                : "Error: " + error}
            </div>
          )}

          <div className="flex flex-col items-center gap-5">
            <button
              onClick={handleStart}
              disabled={!canStart || summaryLoading}
              className="start-conversation-button"
              style={{
                opacity: canStart ? 1 : 0.7,
                cursor: canStart ? "pointer" : "not-allowed",
              }}
            >
              Iniciar conversa
            </button>
            <Link href="/config" className="idle-settings-link">
              Settings
            </Link>
          </div>
        </div>
      ) : isLoadingToken ? (
        <div className="loading-transition">
          <Loading />
        </div>
      ) : (
        <div className="conversation-transition">
          <LiveAvatarSession
            apiUrl={apiUrl}
            mode={mode}
            sessionAccessToken={sessionToken}
            voiceChatConfig={voiceChatConfig}
            aecEnabled={
              sessionToken
                ? sessionAvatarAecEnabled
                : summary?.avatarAecEnabled === true
            }
            onSessionStopped={onSessionStopped}
            iaraWsUrl={mode === "LITE_IARA" ? iaraWsUrl : undefined}
            iaraApiUrl={mode === "LITE_IARA" ? iaraApiUrl : undefined}
            iaraSystemPrompt={
              mode === "LITE_IARA" ? iaraSystemPrompt || undefined : undefined
            }
            iaraPresetId={
              mode === "LITE_IARA" ? iaraPresetId || undefined : undefined
            }
            iaraAudio={mode === "LITE_IARA" ? sessionIaraAudio : undefined}
          />
        </div>
      )}
    </div>
  );
};
