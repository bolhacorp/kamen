"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { logIara } from "../../src/pipeline-log";

type Config = {
  API_KEY: string;
  API_URL: string;
  AVATAR_ID: string;
  IS_SANDBOX: boolean;
  VOICE_ID: string;
  CONTEXT_ID: string;
  LANGUAGE: string;
  USE_FULL_MODE: boolean;
  USE_PUSH_TO_TALK_FOR_FULL: boolean;
  ELEVENLABS_API_KEY: string;
  OPENAI_API_KEY: string;
  USE_ELEVENLABS_FOR_LITE: boolean;
  USE_OPENAI_FOR_LITE: boolean;
  USE_OPENAI_REALTIME_FOR_LITE: boolean;
  USE_TRUE_LITE: boolean;
  OPENAI_REALTIME_API_KEY: string;
  OPENAI_REALTIME_SECRET_ID: string;
  OPENAI_REALTIME_PROMPT_ID: string;
  OPENAI_REALTIME_MODEL: string;
  OPENAI_REALTIME_VOICE: string;
  OPENAI_REALTIME_TEMPERATURE: number;
  OPENAI_REALTIME_INSTRUCTIONS: string;
  USE_IARA: boolean;
  IARA_WS_URL: string;
  IARA_API_URL: string;
  IARA_SYSTEM_PROMPT: string;
  IARA_PRESET_ID: string;
  USE_AVATAR_AEC: boolean;
};

const defaultConfig: Config = {
  API_KEY: "",
  API_URL: "https://api.liveavatar.com",
  AVATAR_ID: "",
  IS_SANDBOX: true,
  VOICE_ID: "",
  CONTEXT_ID: "",
  LANGUAGE: "pt",
  USE_FULL_MODE: true,
  USE_PUSH_TO_TALK_FOR_FULL: false,
  ELEVENLABS_API_KEY: "",
  OPENAI_API_KEY: "",
  USE_ELEVENLABS_FOR_LITE: false,
  USE_OPENAI_FOR_LITE: false,
  USE_OPENAI_REALTIME_FOR_LITE: false,
  USE_TRUE_LITE: false,
  OPENAI_REALTIME_API_KEY: "",
  OPENAI_REALTIME_SECRET_ID: "",
  OPENAI_REALTIME_PROMPT_ID: "",
  OPENAI_REALTIME_MODEL: "gpt-realtime",
  OPENAI_REALTIME_VOICE: "marin",
  OPENAI_REALTIME_TEMPERATURE: 0.8,
  OPENAI_REALTIME_INSTRUCTIONS: "",
  USE_IARA: false,
  IARA_WS_URL: "",
  IARA_API_URL: "",
  IARA_SYSTEM_PROMPT: "",
  IARA_PRESET_ID: "",
  USE_AVATAR_AEC: false,
};

const OPENAI_REALTIME_VOICES = [
  { value: "alloy", label: "Alloy" },
  { value: "ash", label: "Ash" },
  { value: "ballad", label: "Ballad" },
  { value: "coral", label: "Coral" },
  { value: "echo", label: "Echo" },
  { value: "fable", label: "Fable" },
  { value: "onyx", label: "Onyx" },
  { value: "nova", label: "Nova" },
  { value: "shimmer", label: "Shimmer" },
  { value: "sage", label: "Sage" },
  { value: "verse", label: "Verse" },
  { value: "marin", label: "Marin" },
  { value: "cedar", label: "Cedar" },
] as const;

/** Fallback when OpenAI model list cannot be fetched */
const OPENAI_REALTIME_MODELS_FALLBACK = [
  { value: "gpt-realtime", label: "gpt-realtime" },
  { value: "gpt-realtime-mini", label: "gpt-realtime-mini" },
  {
    value: "gpt-4o-mini-realtime-preview",
    label: "gpt-4o-mini-realtime-preview",
  },
];

type TestState = "idle" | "testing" | "ok" | "error";

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "ok" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [testLiveAvatar, setTestLiveAvatar] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  const [testFull, setTestFull] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  // Reserved for future ElevenLabs test button
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for UI
  const [testElevenLabs, setTestElevenLabs] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  const [testOpenAI, setTestOpenAI] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  const [testIaraServer, setTestIaraServer] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  const [testIaraBrowser, setTestIaraBrowser] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  const [testIaraVoice, setTestIaraVoice] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });
  const [voices, setVoices] = useState<
    { id: string; name: string; language?: string }[]
  >([]);
  const [avatars, setAvatars] = useState<{ id: string; name: string }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- setSecrets used in loadLists
  const [secrets, setSecrets] = useState<
    { id: string; secret_name: string; secret_type: string }[]
  >([]);
  const [openaiRealtimeModels, setOpenaiRealtimeModels] = useState<
    { id: string; created?: number }[]
  >([]);
  const [registerSecretLoading, setRegisterSecretLoading] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [micCheck, setMicCheck] = useState<{
    state: TestState;
    message?: string;
  }>({ state: "idle" });

  const languagesFromVoices = useMemo(
    () =>
      [...new Set(voices.map((v) => v.language).filter(Boolean))] as string[],
    [voices],
  ).sort();

  const realtimeModelOptions = useMemo(() => {
    const fromApi = openaiRealtimeModels.map((m) => ({
      value: m.id,
      label: m.id,
    }));
    if (fromApi.length > 0) return fromApi;
    return OPENAI_REALTIME_MODELS_FALLBACK;
  }, [openaiRealtimeModels]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Failed to load config");
      const data = await res.json();
      setConfig({ ...defaultConfig, ...data });
    } catch (e) {
      setLoadError((e as Error).message);
      setConfig(defaultConfig);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /** Ensure at most one LITE provider is on (backend uses first in priority). */
  useEffect(() => {
    const count = [
      config.USE_TRUE_LITE,
      config.USE_IARA,
      config.USE_OPENAI_REALTIME_FOR_LITE,
    ].filter(Boolean).length;
    if (count > 1) {
      setConfig((prev) => {
        const next = { ...prev };
        if (prev.USE_TRUE_LITE) {
          next.USE_IARA = false;
          next.USE_OPENAI_REALTIME_FOR_LITE = false;
        } else if (prev.USE_IARA) {
          next.USE_OPENAI_REALTIME_FOR_LITE = false;
        }
        return next;
      });
      return;
    }
    /** When Lite mode is on, at least one provider must be selected; default to True LITE. */
    if (!config.USE_FULL_MODE && count === 0) {
      setConfig((prev) => ({
        ...prev,
        USE_TRUE_LITE: true,
        USE_IARA: false,
        USE_OPENAI_REALTIME_FOR_LITE: false,
      }));
    }
  }, [
    config.USE_FULL_MODE,
    config.USE_TRUE_LITE,
    config.USE_IARA,
    config.USE_OPENAI_REALTIME_FOR_LITE,
  ]);

  useEffect(() => {
    if (loading || !config.API_KEY?.trim()) return;
    setListsLoading(true);
    const fetches: [
      Promise<{ voices?: unknown[] }>,
      Promise<{ avatars?: unknown[] }>,
      Promise<{
        secrets?: { id: string; secret_name: string; secret_type: string }[];
      }>,
      Promise<{ models?: { id: string; created?: number }[] }>,
    ] = [
      fetch("/api/config/voices").then((r) =>
        r.ok ? r.json() : { voices: [] },
      ),
      fetch("/api/config/avatars").then((r) =>
        r.ok ? r.json() : { avatars: [] },
      ),
      fetch("/api/config/secrets").then((r) =>
        r.ok ? r.json() : { secrets: [] },
      ),
      fetch("/api/config/openai-realtime-models").then((r) =>
        r.ok ? r.json() : { models: [] },
      ),
    ];
    Promise.all(fetches)
      .then(([v, a, s, m]) => {
        setVoices(
          (v.voices ?? []) as { id: string; name: string; language?: string }[],
        );
        setAvatars((a.avatars ?? []) as { id: string; name: string }[]);
        setSecrets(
          (s.secrets ?? []) as {
            id: string;
            secret_name: string;
            secret_type: string;
          }[],
        );
        setOpenaiRealtimeModels(
          (m.models ?? []) as { id: string; created?: number }[],
        );
      })
      .catch(() => {})
      .finally(() => setListsLoading(false));
  }, [loading, config.API_KEY]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveStatus("error");
        setSaveMessage(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaveStatus("ok");
      setSaveMessage(
        "Settings saved. They are stored locally and not sent to GitHub.",
      );
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage((e as Error).message);
    }
  };

  const handleResetDefaults = async () => {
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      const res = await fetch("/api/config/defaults");
      if (!res.ok) throw new Error("Failed to load defaults");
      const defaults = await res.json();
      setConfig({ ...defaultConfig, ...defaults });
      const postRes = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      if (!postRes.ok) {
        const data = await postRes.json().catch(() => ({}));
        setSaveStatus("error");
        setSaveMessage(data.error ?? "Failed to save defaults");
        return;
      }
      setSaveStatus("ok");
      setSaveMessage("Reset to defaults and saved.");
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage((e as Error).message);
    }
  };

  const update = (key: keyof Config, value: string | boolean | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  /** Lite mode = use third-party voice (STT+LLM+TTS). When on, Full mode is off and the third-party section is shown. */
  const useLiteMode = !config.USE_FULL_MODE;

  /** Set exactly one LITE voice provider (mutually exclusive). Backend uses same keys; only one should be on. */
  const setLiteProvider = (
    option: "true_lite" | "iara" | "openai_realtime",
  ) => {
    setConfig((prev) => ({
      ...prev,
      USE_TRUE_LITE: option === "true_lite",
      USE_IARA: option === "iara",
      USE_OPENAI_REALTIME_FOR_LITE: option === "openai_realtime",
    }));
  };

  const registerOpenAISecret = useCallback(async () => {
    const key =
      (config.OPENAI_REALTIME_API_KEY ?? "").trim() ||
      (config.OPENAI_API_KEY ?? "").trim();
    if (!key) return;
    setRegisterSecretLoading(true);
    try {
      const res = await fetch("/api/config/register-openai-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          OPENAI_REALTIME_API_KEY: key,
          secret_name: "OpenAI Realtime",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveMessage(data.error ?? `HTTP ${res.status}`);
        setSaveStatus("error");
        return;
      }
      const secretId = data.secret_id;
      if (secretId) {
        setConfig((prev) => ({ ...prev, OPENAI_REALTIME_SECRET_ID: secretId }));
        setSaveMessage("Secret registered. Save config to persist.");
        setSaveStatus("ok");
      }
    } catch (e) {
      setSaveMessage((e as Error).message);
      setSaveStatus("error");
    } finally {
      setRegisterSecretLoading(false);
    }
  }, [config.OPENAI_REALTIME_API_KEY, config.OPENAI_API_KEY]);

  const checkMicrophone = useCallback(async () => {
    setMicCheck({ state: "testing" });
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setMicCheck({
          state: "error",
          message: "Microphone API not available (use HTTPS or localhost).",
        });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicCheck({ state: "ok", message: "Microphone access granted." });
    } catch (e) {
      const err = e as Error & { name?: string };
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setMicCheck({
          state: "error",
          message: "Permission denied. Allow microphone in your browser.",
        });
      } else if (err.name === "NotFoundError") {
        setMicCheck({ state: "error", message: "No microphone found." });
      } else {
        setMicCheck({
          state: "error",
          message: err.message || "Microphone check failed.",
        });
      }
    }
  }, []);

  const resolveIaraVoiceWsUrl = useCallback(() => {
    const direct = (config.IARA_WS_URL ?? "").trim();
    if (direct) return direct;
    const api = (config.IARA_API_URL ?? "").trim();
    if (!api) return "";
    const noTrailing = api.replace(/\/$/, "");
    if (noTrailing.endsWith("/api/voice/ws")) return noTrailing;
    if (noTrailing.endsWith("/api/voice")) {
      const base = noTrailing.slice(0, -"/api/voice".length);
      return base.replace(/^http(s?):\/\//, "ws$1://") + "/api/voice/ws";
    }
    return noTrailing.replace(/^http(s?):\/\//, "ws$1://") + "/api/voice/ws";
  }, [config.IARA_WS_URL, config.IARA_API_URL]);

  const makeTestTonePcm = useCallback(() => {
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
  }, []);

  const testIaraBrowserWs = useCallback(async () => {
    const url = resolveIaraVoiceWsUrl();
    if (!url) {
      setTestIaraBrowser({
        state: "error",
        message: "Set iara WebSocket URL or Voice API URL first.",
      });
      logIara("Config test (browser): no URL", "warn");
      return;
    }
    setTestIaraBrowser({ state: "testing" });
    const sessionId = `cfg-${Date.now()}`;
    const pcm = makeTestTonePcm();
    const commit: Record<string, unknown> = {
      type: "turn.commit",
      session_id: sessionId,
    };
    const prompt = (config.IARA_SYSTEM_PROMPT ?? "").trim();
    if (prompt) commit.system_prompt = prompt;
    const presetId = (config.IARA_PRESET_ID ?? "").trim();
    if (presetId) commit.preset_id = presetId;

    logIara("Config test (browser): starting", "info", {
      url,
      sessionId,
      audioBytes: pcm.byteLength,
    });

    let ws: WebSocket | null = null;
    let done = false;
    let sawSessionReady = false;
    let sawError = false;
    let lastTextFrame: string | null = null;
    const finish = (result: { state: TestState; message?: string }) => {
      if (done) return;
      done = true;
      setTestIaraBrowser(result);
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "stop" }));
        }
      } catch {
        // ignore
      }
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };

    const timeout = window.setTimeout(() => {
      logIara("Config test (browser): timeout", "warn", {
        sawSessionReady,
        sawError,
        lastTextFrame: lastTextFrame?.slice(0, 400),
      });
      const extra = [
        sawSessionReady ? "saw session_ready" : null,
        sawError ? "saw error" : null,
        lastTextFrame
          ? `last text frame: ${lastTextFrame.slice(0, 500)}`
          : null,
      ]
        .filter(Boolean)
        .join("; ");
      finish({
        state: "error",
        message: `Timed out waiting for turn events.${extra ? " " + extra : ""}`,
      });
    }, 5000);

    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        logIara("Config test (browser): WebSocket open", "info", { sessionId });
        try {
          ws?.send(pcm.buffer);
          ws?.send(JSON.stringify(commit));
          logIara(
            "Config test (browser): sent audio.append(binary)+turn.commit",
            "info",
            {
              sessionId,
              audioBytes: pcm.byteLength,
              commit,
            },
          );
        } catch (e) {
          window.clearTimeout(timeout);
          finish({
            state: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        lastTextFrame = ev.data;
        logIara("Config test (browser): text frame", "debug", {
          length: ev.data.length,
          preview: ev.data.slice(0, 200),
        });
        try {
          const data = JSON.parse(ev.data) as {
            type?: string;
            message?: string;
            code?: string;
          };
          if (data?.type === "session_ready") {
            // backward compatibility for old server contracts
            sawSessionReady = true;
            logIara("Config test (browser): session_ready", "info");
            window.clearTimeout(timeout);
            finish({ state: "ok", message: "session_ready received" });
          } else if (
            data?.type === "turn.started" ||
            data?.type === "tts.audio" ||
            data?.type === "turn.completed" ||
            data?.type === "stt.final"
          ) {
            window.clearTimeout(timeout);
            finish({ state: "ok", message: `received ${data.type}` });
          } else if (data?.type === "error") {
            sawError = true;
            logIara("Config test (browser): error frame", "error", {
              message: data?.message,
              code: data?.code,
            });
            window.clearTimeout(timeout);
            const msg = data?.message ?? "Unknown iara error";
            const code = data?.code ? ` (${data.code})` : "";
            finish({ state: "error", message: `${msg}${code}` });
          } else {
            logIara("Config test (browser): unknown type", "debug", {
              type: data?.type,
            });
          }
        } catch {
          // ignore non-json
        }
      };
      ws.onerror = () => {
        logIara("Config test (browser): WebSocket error event", "error");
      };
      ws.onclose = (ev) => {
        if (done) return;
        logIara("Config test (browser): WebSocket closed", "info", {
          code: ev.code,
          reason: ev.reason,
          wasClean: ev.wasClean,
          lastTextFrame: lastTextFrame?.slice(0, 300),
        });
        window.clearTimeout(timeout);
        const extra = [
          `code=${ev.code}`,
          ev.reason ? `reason=${JSON.stringify(ev.reason)}` : null,
          `wasClean=${ev.wasClean}`,
          lastTextFrame
            ? `last text frame: ${lastTextFrame.slice(0, 500)}`
            : null,
        ]
          .filter(Boolean)
          .join("; ");
        finish({
          state: "error",
          message: `WebSocket closed before receiving turn events. ${extra}`,
        });
      };
    } catch (e) {
      window.clearTimeout(timeout);
      logIara("Config test (browser): exception", "error", {
        error: e instanceof Error ? e.message : String(e),
      });
      finish({ state: "error", message: (e as Error).message });
    }
  }, [
    resolveIaraVoiceWsUrl,
    makeTestTonePcm,
    config.IARA_SYSTEM_PROMPT,
    config.IARA_PRESET_ID,
  ]);

  const runTest = async (
    endpoint: string,
    body: Record<string, unknown>,
    setResult: React.Dispatch<
      React.SetStateAction<{ state: TestState; message?: string }>
    >,
  ) => {
    setResult({ state: "testing" });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setResult({ state: "ok", message: "Key is valid" });
      } else {
        setResult({ state: "error", message: data.error ?? "Test failed" });
      }
    } catch (e) {
      setResult({ state: "error", message: (e as Error).message });
    }
  };

  const testIaraServerWs = useCallback(async () => {
    setTestIaraServer({ state: "testing" });
    try {
      const res = await fetch("/api/config/test/iara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          IARA_WS_URL: config.IARA_WS_URL,
          IARA_API_URL: config.IARA_API_URL,
          IARA_SYSTEM_PROMPT: config.IARA_SYSTEM_PROMPT,
          IARA_PRESET_ID: config.IARA_PRESET_ID,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        detail?: {
          closeCode?: number;
          closeReason?: string;
          wasClean?: boolean;
          lastTextFrame?: string | null;
        };
      };
      if (data.success) {
        setTestIaraServer({ state: "ok", message: "turn events received" });
      } else {
        const parts = [data.error ?? "Test failed"];
        if (data.detail) {
          const d = data.detail;
          const detailParts: string[] = [];
          if (d.closeCode != null) detailParts.push(`code=${d.closeCode}`);
          if (d.closeReason) detailParts.push(`reason=${d.closeReason}`);
          if (d.lastTextFrame)
            detailParts.push(`last frame: ${d.lastTextFrame.slice(0, 400)}`);
          if (detailParts.length) parts.push(detailParts.join("; "));
        }
        setTestIaraServer({
          state: "error",
          message: parts.join(" — "),
        });
      }
    } catch (e) {
      setTestIaraServer({
        state: "error",
        message: (e as Error).message,
      });
    }
  }, [
    config.IARA_WS_URL,
    config.IARA_API_URL,
    config.IARA_SYSTEM_PROMPT,
    config.IARA_PRESET_ID,
  ]);

  const testIaraVoiceApi = useCallback(async () => {
    setTestIaraVoice({ state: "testing" });
    try {
      const res = await fetch("/api/config/test/iara-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          IARA_API_URL: config.IARA_API_URL,
          IARA_SYSTEM_PROMPT: config.IARA_SYSTEM_PROMPT,
          IARA_PRESET_ID: config.IARA_PRESET_ID,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        detail?: string;
      };
      if (data.success) {
        setTestIaraVoice({
          state: "ok",
          message: data.message ?? "OK",
        });
      } else {
        const msg = [data.error ?? "Test failed"];
        if (data.detail) msg.push(data.detail);
        setTestIaraVoice({
          state: "error",
          message: msg.join(" — "),
        });
      }
    } catch (e) {
      setTestIaraVoice({
        state: "error",
        message: (e as Error).message,
      });
    }
  }, [config.IARA_API_URL, config.IARA_SYSTEM_PROMPT, config.IARA_PRESET_ID]);

  const layoutClass =
    "fixed inset-0 flex flex-col bg-black text-white overflow-hidden";
  const headerFooterClass = "flex-shrink-0 bg-black border-white/10 z-10";
  const contentMaxWidth = "max-w-2xl mx-auto w-full px-6 sm:px-8";

  if (loading) {
    return (
      <div className={layoutClass}>
        <header
          className={`${headerFooterClass} border-b`}
          style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 56 }}
        >
          <div
            className={`${contentMaxWidth} py-4 flex items-center justify-between`}
          >
            <h1 className="text-xl font-semibold">Settings</h1>
            <Link
              href="/"
              className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm"
            >
              Back to Demo
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <p>Loading config…</p>
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={layoutClass}>
        <header
          className={`${headerFooterClass} border-b`}
          style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 56 }}
        >
          <div
            className={`${contentMaxWidth} py-4 flex items-center justify-between`}
          >
            <h1 className="text-xl font-semibold">Settings</h1>
            <Link
              href="/"
              className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm"
            >
              Back to Demo
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <p className="text-red-400">Error: {loadError}</p>
          <p className="mt-2 text-gray-400">
            You can still edit and save to create the config file.
          </p>
          <Link href="/" className="text-blue-400 underline mt-4 inline-block">
            Back to Demo
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className={layoutClass}>
      <header
        className={`${headerFooterClass} border-b`}
        style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 56 }}
      >
        <div
          className={`${contentMaxWidth} py-4 flex items-center justify-between`}
        >
          <h1 className="text-2xl font-semibold">Settings</h1>
          <Link href="/" className="config-btn-secondary">
            Back to Demo
          </Link>
        </div>
      </header>

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className={`${contentMaxWidth} pb-32 pt-6`}>
          <p className="config-page-intro">
            Settings are stored in{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-gray-300">
              config.local.json
            </code>{" "}
            on your machine and are not sent to GitHub.
          </p>

          <form id="config-form" onSubmit={handleSave} className="space-y-0">
            <section className="config-section">
              <h2 className="config-section-title">Browser & device</h2>
              <p className="text-xs text-gray-500 mb-2">
                Voice features need microphone access. This check uses the same
                browser API (getUserMedia) that the demo uses during a session
                to capture and send your voice to LiveAvatar.
              </p>
              <p className="text-xs text-gray-500 mb-3">
                In a session, the SDK creates an audio track from your
                microphone and publishes it to the LiveAvatar session (LiveKit).
                So if this check passes, your mic will be used to send audio to
                the service.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={checkMicrophone}
                  disabled={micCheck.state === "testing"}
                  className="config-btn-primary"
                >
                  {micCheck.state === "testing"
                    ? "Checking…"
                    : "Check microphone"}
                </button>
                {micCheck.state === "ok" && (
                  <span className="text-green-400 text-sm">
                    {micCheck.message}
                  </span>
                )}
                {micCheck.state === "error" && (
                  <span className="text-red-400 text-sm">
                    {micCheck.message}
                  </span>
                )}
              </div>
            </section>

            <section className="config-section">
              <h2 className="config-section-title">LiveAvatar</h2>
              <div className="space-y-4">
                <div>
                  <label className="config-label">API Key</label>
                  <p className="config-hint mb-1">
                    Must be a <strong>LiveAvatar</strong> key from{" "}
                    <a
                      href="https://app.liveavatar.com/developers"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      app.liveavatar.com/developers
                    </a>
                    —not a HeyGen key. Leading/trailing spaces are ignored.
                  </p>
                  <input
                    type="password"
                    value={config.API_KEY}
                    onChange={(e) => update("API_KEY", e.target.value)}
                    className="config-input"
                    placeholder="Your LiveAvatar API key"
                  />
                </div>
                <div>
                  <label className="config-label">API URL</label>
                  <input
                    type="text"
                    value={config.API_URL}
                    onChange={(e) => update("API_URL", e.target.value)}
                    className="config-input"
                    placeholder="https://api.liveavatar.com"
                  />
                </div>
                <div>
                  <label className="config-label">Avatar ID</label>
                  {listsLoading ? (
                    <p className="text-xs text-gray-500">
                      Loading avatars from API…
                    </p>
                  ) : avatars.length > 0 ? (
                    <select
                      value={
                        avatars.some((a) => a.id === config.AVATAR_ID)
                          ? config.AVATAR_ID
                          : "__custom__"
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v !== "__custom__") update("AVATAR_ID", v);
                      }}
                      className="config-select"
                    >
                      <option value="">— Select avatar —</option>
                      {avatars.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.id.slice(0, 8)}…)
                        </option>
                      ))}
                      <option value="__custom__">
                        — Custom UUID (paste below) —
                      </option>
                    </select>
                  ) : null}
                  <input
                    type="text"
                    value={config.AVATAR_ID}
                    onChange={(e) => update("AVATAR_ID", e.target.value)}
                    className="config-input mt-1"
                    placeholder="Or paste Avatar UUID from LiveAvatar dashboard"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.IS_SANDBOX}
                      onClick={() => update("IS_SANDBOX", !config.IS_SANDBOX)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        config.IS_SANDBOX ? "bg-blue-500" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          config.IS_SANDBOX ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <label className="text-sm text-gray-300">
                      Sandbox mode
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 ml-0">
                    Sandbox: no credits are used and sessions last ~1 minute
                    with a limited avatar set. Use for development; turn off for
                    production.
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      runTest(
                        "/api/config/test/liveavatar",
                        {
                          API_KEY: config.API_KEY,
                          API_URL: config.API_URL,
                          AVATAR_ID: config.AVATAR_ID,
                          IS_SANDBOX: config.IS_SANDBOX,
                        },
                        setTestLiveAvatar,
                      )
                    }
                    disabled={testLiveAvatar.state === "testing"}
                    className="config-btn-primary"
                  >
                    {testLiveAvatar.state === "testing"
                      ? "Testing…"
                      : "Test API key"}
                  </button>
                  {testLiveAvatar.state === "ok" && (
                    <span className="text-green-400 text-sm">Key is valid</span>
                  )}
                  {testLiveAvatar.state === "error" && (
                    <span className="text-red-400 text-sm">
                      {testLiveAvatar.message}
                    </span>
                  )}
                </div>

                <div className="border-t border-white/10 pt-6 mt-6 space-y-4">
                  <h3 className="config-subsection-title">
                    Voice mode — choose one
                  </h3>
                  <p className="text-sm text-gray-400">
                    Only one voice mode is used per session. Select Full mode
                    for LiveAvatar voice and context, or Lite mode for a
                    third-party pipeline (OpenAI Realtime or iara).
                  </p>
                  <div
                    className="grid gap-3 sm:grid-cols-2"
                    role="radiogroup"
                    aria-label="Voice mode"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={config.USE_FULL_MODE}
                      onClick={() => {
                        if (!config.USE_FULL_MODE) {
                          update("USE_FULL_MODE", true);
                          setConfig((prev) => ({
                            ...prev,
                            USE_TRUE_LITE: false,
                            USE_IARA: false,
                            USE_OPENAI_REALTIME_FOR_LITE: false,
                          }));
                        }
                      }}
                      className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                        config.USE_FULL_MODE
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-white/15 bg-white/5 hover:border-white/25"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          config.USE_FULL_MODE
                            ? "border-blue-500 bg-blue-500"
                            : "border-white/40"
                        }`}
                      >
                        {config.USE_FULL_MODE && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>
                      <span>
                        <span className="font-medium text-gray-200">
                          Full mode
                        </span>
                        <span className="mt-1 block text-xs text-gray-500">
                          LiveAvatar voice & context for “Iniciar conversa”
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={useLiteMode}
                      onClick={() => {
                        if (config.USE_FULL_MODE) {
                          update("USE_FULL_MODE", false);
                          const hasProvider =
                            config.USE_TRUE_LITE ||
                            config.USE_IARA ||
                            config.USE_OPENAI_REALTIME_FOR_LITE;
                          if (!hasProvider) {
                            setLiteProvider("true_lite");
                          }
                        }
                      }}
                      className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                        useLiteMode
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-white/15 bg-white/5 hover:border-white/25"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          useLiteMode
                            ? "border-blue-500 bg-blue-500"
                            : "border-white/40"
                        }`}
                      >
                        {useLiteMode && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>
                      <span>
                        <span className="font-medium text-gray-200">
                          Lite mode
                        </span>
                        <span className="mt-1 block text-xs text-gray-500">
                          Third-party STT + LLM + TTS (OpenAI Realtime or iara)
                        </span>
                      </span>
                    </button>
                  </div>

                  {config.USE_FULL_MODE && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={config.USE_PUSH_TO_TALK_FOR_FULL}
                          onClick={() =>
                            update(
                              "USE_PUSH_TO_TALK_FOR_FULL",
                              !config.USE_PUSH_TO_TALK_FOR_FULL,
                            )
                          }
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            config.USE_PUSH_TO_TALK_FOR_FULL
                              ? "bg-blue-500"
                              : "bg-white/20"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              config.USE_PUSH_TO_TALK_FOR_FULL
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <label className="text-sm text-gray-300">
                          Use Push to Talk when starting in Full mode
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Voice and Context must be valid UUIDs.
                      </p>
                      <div>
                        <label className="config-label">Voice ID</label>
                        {listsLoading ? (
                          <p className="config-hint">
                            Loading voices from API…
                          </p>
                        ) : voices.length > 0 ? (
                          <select
                            value={
                              voices.some((v) => v.id === config.VOICE_ID)
                                ? config.VOICE_ID
                                : "__custom__"
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v !== "__custom__") update("VOICE_ID", v);
                            }}
                            className="config-select"
                          >
                            <option value="">— Select voice —</option>
                            {voices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} {v.language ? `(${v.language})` : ""} —{" "}
                                {v.id.slice(0, 8)}…
                              </option>
                            ))}
                            <option value="__custom__">
                              — Custom UUID (paste below) —
                            </option>
                          </select>
                        ) : null}
                        <input
                          type="text"
                          value={config.VOICE_ID}
                          onChange={(e) => update("VOICE_ID", e.target.value)}
                          className="config-input mt-1"
                          placeholder="Or paste Voice UUID from LiveAvatar dashboard"
                        />
                      </div>
                      <div>
                        <label className="config-label">Context ID</label>
                        <p className="config-hint mb-1">
                          The API does not provide a list of contexts; paste the
                          UUID from your LiveAvatar dashboard.
                        </p>
                        <input
                          type="text"
                          value={config.CONTEXT_ID}
                          onChange={(e) => update("CONTEXT_ID", e.target.value)}
                          className="config-input"
                          placeholder="Context UUID"
                        />
                      </div>
                      <div>
                        <label className="config-label">Language</label>
                        {listsLoading ? (
                          <p className="text-xs text-gray-500">Loading…</p>
                        ) : languagesFromVoices.length > 0 ? (
                          <select
                            value={
                              languagesFromVoices.includes(config.LANGUAGE)
                                ? config.LANGUAGE
                                : "__custom__"
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v !== "__custom__") update("LANGUAGE", v);
                            }}
                            className="config-select"
                          >
                            <option value="">— Select language —</option>
                            {languagesFromVoices.map((lang) => (
                              <option key={lang} value={lang}>
                                {lang}
                              </option>
                            ))}
                            <option value="__custom__">
                              — Custom (enter below) —
                            </option>
                          </select>
                        ) : null}
                        <input
                          type="text"
                          value={config.LANGUAGE}
                          onChange={(e) => update("LANGUAGE", e.target.value)}
                          className="config-input mt-1"
                          placeholder="e.g. en, pt (from voices or custom code)"
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            runTest(
                              "/api/config/test/full",
                              {
                                API_KEY: config.API_KEY,
                                API_URL: config.API_URL,
                                AVATAR_ID: config.AVATAR_ID,
                                VOICE_ID: config.VOICE_ID,
                                CONTEXT_ID: config.CONTEXT_ID,
                                LANGUAGE: config.LANGUAGE,
                                IS_SANDBOX: config.IS_SANDBOX,
                              },
                              setTestFull,
                            )
                          }
                          disabled={testFull.state === "testing"}
                          className="config-btn-primary"
                        >
                          {testFull.state === "testing"
                            ? "Testing…"
                            : "Test FULL mode"}
                        </button>
                        {testFull.state === "ok" && (
                          <span className="text-green-400 text-sm">
                            API key, Avatar, Voice & Context OK
                          </span>
                        )}
                        {testFull.state === "error" && (
                          <span className="text-red-400 text-sm">
                            {testFull.message}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {useLiteMode && (
                  <div className="space-y-6 border-t border-white/10 pt-6 mt-4">
                    <p className="text-sm text-gray-400">
                      Choose one voice provider. LiveAvatar is still used for
                      the avatar and lipsync.
                    </p>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={config.USE_TRUE_LITE}
                          onClick={() => setLiteProvider("true_lite")}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            config.USE_TRUE_LITE ? "bg-blue-500" : "bg-white/20"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              config.USE_TRUE_LITE
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <label className="text-sm text-gray-300">
                          True LITE — we run OpenAI Realtime, LiveAvatar for
                          lipsync only
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={config.USE_IARA}
                          onClick={() => setLiteProvider("iara")}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            config.USE_IARA ? "bg-blue-500" : "bg-white/20"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              config.USE_IARA
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <label className="text-sm text-gray-300">
                          iara — fully local voice (your orchestrator)
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={config.USE_OPENAI_REALTIME_FOR_LITE}
                          onClick={() => setLiteProvider("openai_realtime")}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            config.USE_OPENAI_REALTIME_FOR_LITE
                              ? "bg-blue-500"
                              : "bg-white/20"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              config.USE_OPENAI_REALTIME_FOR_LITE
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <label className="text-sm text-gray-300">
                          LiveAvatar-managed LITE — they broker OpenAI Realtime
                        </label>
                      </div>
                    </div>

                    {(config.USE_TRUE_LITE || config.USE_IARA) && (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                        <div className="flex items-start gap-3">
                          <input
                            id="use-avatar-aec"
                            type="checkbox"
                            checked={config.USE_AVATAR_AEC}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                USE_AVATAR_AEC: e.target.checked,
                              }))
                            }
                            className="mt-1 rounded border-white/30"
                          />
                          <div>
                            <label
                              htmlFor="use-avatar-aec"
                              className="text-sm text-gray-200 font-medium cursor-pointer"
                            >
                              Reduce avatar echo in microphone (experimental)
                            </label>
                            <p className="text-xs text-gray-500 mt-1">
                              Uses playback from the session video as a
                              reference for software echo cancellation. Applies
                              to True Lite and Lite (iara) only; save settings
                              for the demo to pick it up.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {config.USE_IARA && (
                      <div className="config-subsection space-y-4">
                        <h3 className="config-subsection-title">
                          iara — Voice API & WebSocket
                        </h3>
                        <p className="text-xs text-gray-500">
                          Point the demo at your iara orchestrator (HTTP Voice
                          API and/or WebSocket). The Voice API (
                          <code>/api/voice</code>) is used for turn-based voice;
                          optional WebSocket bridge URL if you run one.
                        </p>
                        <div>
                          <label className="config-label">
                            iara Voice API URL (optional)
                          </label>
                          <input
                            type="text"
                            value={config.IARA_API_URL}
                            onChange={(e) =>
                              update("IARA_API_URL", e.target.value)
                            }
                            className="config-input"
                            placeholder="http://127.0.0.1:13000"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Accepts base URL (e.g. http://127.0.0.1:13000) or
                            full endpoint (e.g.
                            http://127.0.0.1:17860/api/voice).
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={testIaraVoiceApi}
                              disabled={testIaraVoice.state === "testing"}
                              className="config-btn-secondary"
                            >
                              {testIaraVoice.state === "testing"
                                ? "Testing…"
                                : "Test Voice API (server)"}
                            </button>
                            {testIaraVoice.state === "ok" && (
                              <span className="text-green-400 text-sm">
                                {testIaraVoice.message ?? "OK"}
                              </span>
                            )}
                            {testIaraVoice.state === "error" && (
                              <span className="text-red-400 text-sm">
                                {testIaraVoice.message ?? "Error"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="config-label">
                            iara WebSocket URL (optional custom bridge)
                          </label>
                          <input
                            type="text"
                            value={config.IARA_WS_URL}
                            onChange={(e) =>
                              update("IARA_WS_URL", e.target.value)
                            }
                            className="config-input"
                            placeholder="ws://127.0.0.1:17860/api/voice/ws"
                          />
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={testIaraBrowserWs}
                              disabled={testIaraBrowser.state === "testing"}
                              className="config-btn-primary"
                            >
                              {testIaraBrowser.state === "testing"
                                ? "Testing…"
                                : "Test WS (browser)"}
                            </button>
                            <button
                              type="button"
                              onClick={testIaraServerWs}
                              disabled={testIaraServer.state === "testing"}
                              className="config-btn-secondary"
                            >
                              {testIaraServer.state === "testing"
                                ? "Testing…"
                                : "Test WS (server)"}
                            </button>
                            {testIaraBrowser.state === "ok" && (
                              <span className="text-green-400 text-sm">
                                Browser: {testIaraBrowser.message ?? "OK"}
                              </span>
                            )}
                            {testIaraBrowser.state === "error" && (
                              <span className="text-red-400 text-sm">
                                Browser: {testIaraBrowser.message ?? "Error"}
                              </span>
                            )}
                            {testIaraServer.state === "ok" && (
                              <span className="text-green-400 text-sm">
                                Server: {testIaraServer.message ?? "OK"}
                              </span>
                            )}
                            {testIaraServer.state === "error" && (
                              <span className="text-red-400 text-sm">
                                Server: {testIaraServer.message ?? "Error"}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Use only if you run a dedicated WS ingest bridge.
                            Browser test checks CORS/origin + client
                            reachability. Server test checks if the Next.js
                            server can reach that WS endpoint.
                          </p>
                        </div>
                        <div>
                          <label className="config-label">
                            System prompt / instructions (optional)
                          </label>
                          <textarea
                            value={config.IARA_SYSTEM_PROMPT}
                            onChange={(e) =>
                              update("IARA_SYSTEM_PROMPT", e.target.value)
                            }
                            rows={3}
                            className="config-textarea"
                            placeholder="e.g. You are a helpful assistant."
                          />
                        </div>
                        <div>
                          <label className="config-label">
                            Preset ID (optional)
                          </label>
                          <input
                            type="text"
                            value={config.IARA_PRESET_ID}
                            onChange={(e) =>
                              update("IARA_PRESET_ID", e.target.value)
                            }
                            className="config-input"
                            placeholder="Orchestrator preset id"
                          />
                        </div>
                      </div>
                    )}

                    {(config.USE_TRUE_LITE ||
                      config.USE_OPENAI_REALTIME_FOR_LITE) && (
                      <div className="config-subsection space-y-4">
                        <h3 className="config-subsection-title">
                          OpenAI Realtime — API key, model & voice
                        </h3>
                        <div>
                          <label className="config-label">OpenAI API key</label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="password"
                              value={config.OPENAI_REALTIME_API_KEY}
                              onChange={(e) =>
                                update(
                                  "OPENAI_REALTIME_API_KEY",
                                  e.target.value,
                                )
                              }
                              className="config-input flex-1 min-w-[200px]"
                              placeholder="sk-… (ephemeral keys for True LITE; register for LiveAvatar-managed)"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                runTest(
                                  "/api/config/test/openai",
                                  {
                                    OPENAI_REALTIME_API_KEY:
                                      config.OPENAI_REALTIME_API_KEY,
                                  },
                                  setTestOpenAI,
                                )
                              }
                              disabled={testOpenAI.state === "testing"}
                              className="config-btn-primary"
                            >
                              {testOpenAI.state === "testing"
                                ? "Testing…"
                                : "Test API key"}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            True LITE: this key is enough — server uses it to
                            mint ephemeral keys. LiveAvatar-managed: enter key
                            and click Register below.
                          </p>
                          {testOpenAI.state === "ok" && (
                            <p className="text-xs text-green-400 mt-1">
                              Key is valid
                            </p>
                          )}
                          {testOpenAI.state === "error" && (
                            <p className="text-xs text-red-400 mt-1">
                              {testOpenAI.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="config-label">Realtime model</label>
                          <select
                            value={
                              realtimeModelOptions.some(
                                (m) => m.value === config.OPENAI_REALTIME_MODEL,
                              )
                                ? config.OPENAI_REALTIME_MODEL
                                : ""
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v) update("OPENAI_REALTIME_MODEL", v);
                            }}
                            className="config-select"
                          >
                            <option value="">— Select model —</option>
                            {realtimeModelOptions.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={config.OPENAI_REALTIME_MODEL}
                            onChange={(e) =>
                              update("OPENAI_REALTIME_MODEL", e.target.value)
                            }
                            className="config-input mt-1"
                            placeholder="Or type model id (e.g. gpt-realtime)"
                          />
                        </div>
                        <div>
                          <label className="config-label">Voice</label>
                          <select
                            value={config.OPENAI_REALTIME_VOICE}
                            onChange={(e) =>
                              update("OPENAI_REALTIME_VOICE", e.target.value)
                            }
                            className="config-select"
                          >
                            {OPENAI_REALTIME_VOICES.map((v) => (
                              <option key={v.value} value={v.value}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500 mt-1.5">
                            <a
                              href="https://platform.openai.com/playground/tts"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline"
                            >
                              Test voices in the OpenAI TTS Playground
                            </a>{" "}
                            — Marin and Cedar recommended. True LITE: Nova,
                            Fable, Onyx are not supported by the Realtime API
                            and will use Marin.
                          </p>
                        </div>
                        <div>
                          <label className="config-label">
                            System instructions
                          </label>
                          <textarea
                            value={config.OPENAI_REALTIME_INSTRUCTIONS}
                            onChange={(e) =>
                              update(
                                "OPENAI_REALTIME_INSTRUCTIONS",
                                e.target.value,
                              )
                            }
                            rows={4}
                            className="config-textarea"
                            placeholder="e.g. You are a realtime voice AI. Personality: warm, witty; never claim to be human."
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            True LITE: sent with the session.
                            LiveAvatar-managed: we send it but they may not
                            forward it.
                          </p>
                        </div>
                        {config.USE_TRUE_LITE && (
                          <div>
                            <label className="config-label">
                              OpenAI Prompt ID (optional, True LITE only)
                            </label>
                            <input
                              type="text"
                              value={config.OPENAI_REALTIME_PROMPT_ID}
                              onChange={(e) =>
                                update(
                                  "OPENAI_REALTIME_PROMPT_ID",
                                  e.target.value,
                                )
                              }
                              className="config-input"
                              placeholder="pmpt_… (from OpenAI Prompt library)"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Replaces or complements system instructions above.
                            </p>
                          </div>
                        )}
                        {config.USE_OPENAI_REALTIME_FOR_LITE && (
                          <>
                            <div>
                              <label className="config-label">
                                Temperature (0.6–1.2, LiveAvatar-managed only)
                              </label>
                              <input
                                type="number"
                                min={0.6}
                                max={1.2}
                                step={0.1}
                                value={config.OPENAI_REALTIME_TEMPERATURE}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  if (!Number.isNaN(v))
                                    update("OPENAI_REALTIME_TEMPERATURE", v);
                                }}
                                className="config-input"
                              />
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={registerOpenAISecret}
                                disabled={
                                  registerSecretLoading ||
                                  !(config.OPENAI_REALTIME_API_KEY ?? "").trim()
                                }
                                className="config-btn-secondary"
                              >
                                {registerSecretLoading
                                  ? "Registering…"
                                  : "Register this key with LiveAvatar"}
                              </button>
                              {config.OPENAI_REALTIME_SECRET_ID && (
                                <p className="text-xs text-green-400 mt-2">
                                  Registered. Save config to persist.
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </form>
        </div>
      </main>

      <footer
        className={`${headerFooterClass} border-t`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          minHeight: 72,
        }}
      >
        <div
          className={`${contentMaxWidth} py-4 flex flex-wrap items-center gap-3`}
        >
          <button
            type="submit"
            form="config-form"
            disabled={saveStatus === "saving"}
            className="config-btn-primary"
          >
            {saveStatus === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={saveStatus === "saving"}
            className="config-btn-secondary"
          >
            Reset to defaults
          </button>
          {saveMessage && (
            <p
              className={
                saveStatus === "error"
                  ? "text-red-400 text-sm"
                  : "text-green-400 text-sm"
              }
            >
              {saveMessage}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
