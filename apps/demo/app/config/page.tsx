"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  { value: "gpt-4o-realtime-preview", label: "gpt-4o-realtime-preview" },
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
          <Link
            href="/"
            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm"
          >
            Back to Demo
          </Link>
        </div>
      </header>

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className={`${contentMaxWidth} pb-32 pt-6`}>
          <p className="text-gray-400 text-sm mb-6">
            Settings are stored in{" "}
            <code className="bg-white/10 px-1 rounded">config.local.json</code>{" "}
            on your machine and are not sent to GitHub.
          </p>

          <form id="config-form" onSubmit={handleSave} className="space-y-8">
            <section>
              <h2 className="text-lg font-medium mb-4 text-gray-200">
                Browser & device
              </h2>
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
                  className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
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

            <section>
              <h2 className="text-lg font-medium mb-4 text-gray-200">
                LiveAvatar
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    API Key
                  </label>
                  <p className="text-xs text-gray-500 mb-1">
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
                    className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
                    placeholder="Your LiveAvatar API key"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    API URL
                  </label>
                  <input
                    type="text"
                    value={config.API_URL}
                    onChange={(e) => update("API_URL", e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
                    placeholder="https://api.liveavatar.com"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Avatar ID
                  </label>
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
                      className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
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
                    className="mt-1 w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
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
                    When on: sessions use the LiveAvatar sandbox—no credits are
                    consumed, but sessions end after ~1 minute and only a
                    limited set of avatars (e.g. Wayne) are available. Use for
                    development and testing. Turn off for production.
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
                    className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
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
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium mb-4 text-gray-200">
                FULL mode (voice & context)
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Like OpenAI and ElevenLabs, only one “stack” is used per
                session. When Full mode is on, it is used for “Iniciar conversa”
                (full or push-to-talk). Turn it off when you only use LITE with
                third-party APIs so full-mode config is not sent.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.USE_FULL_MODE}
                  onClick={() => update("USE_FULL_MODE", !config.USE_FULL_MODE)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    config.USE_FULL_MODE ? "bg-blue-500" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.USE_FULL_MODE ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <label className="text-sm text-gray-300">
                  Use Full mode (LiveAvatar voice & context)
                </label>
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
                    <label className="block text-sm text-gray-400 mb-1">
                      Voice ID
                    </label>
                    {listsLoading ? (
                      <p className="text-xs text-gray-500">
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
                        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
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
                      className="mt-1 w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
                      placeholder="Or paste Voice UUID from LiveAvatar dashboard"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Context ID
                    </label>
                    <p className="text-xs text-gray-500 mb-1">
                      The API does not provide a list of contexts; paste the
                      UUID from your LiveAvatar dashboard.
                    </p>
                    <input
                      type="text"
                      value={config.CONTEXT_ID}
                      onChange={(e) => update("CONTEXT_ID", e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
                      placeholder="Context UUID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Language
                    </label>
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
                        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
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
                      className="mt-1 w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
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
                      className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
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
            </section>

            <section>
              <h2 className="text-lg font-medium mb-4 text-gray-200">
                LITE mode (OpenAI Realtime)
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Two options: <strong>True LITE</strong> (we manage Realtime,
                LiveAvatar only for avatar/lipsync) or{" "}
                <strong>LiveAvatar-managed LITE</strong> (LiveAvatar brokers
                Realtime; simpler but custom instructions may not apply). Enable
                one or both; shared settings below apply to whichever you use.
              </p>

              <div className="space-y-6 mb-6">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.USE_TRUE_LITE}
                      onClick={() =>
                        update("USE_TRUE_LITE", !config.USE_TRUE_LITE)
                      }
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
                      True LITE (we manage Realtime, LiveAvatar for lipsync
                      only)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.USE_OPENAI_REALTIME_FOR_LITE}
                      onClick={() =>
                        update(
                          "USE_OPENAI_REALTIME_FOR_LITE",
                          !config.USE_OPENAI_REALTIME_FOR_LITE,
                        )
                      }
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
                      LiveAvatar-managed LITE (they broker Realtime)
                    </label>
                  </div>
                </div>

                {(config.USE_TRUE_LITE ||
                  config.USE_OPENAI_REALTIME_FOR_LITE) && (
                  <div className="ml-0 space-y-4 pl-0 border border-white/10 rounded-md p-4 bg-white/5">
                    <h3 className="text-sm font-medium text-gray-200">
                      OpenAI Realtime settings (used by True LITE and
                      LiveAvatar-managed)
                    </h3>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        OpenAI API key
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="password"
                          value={config.OPENAI_REALTIME_API_KEY}
                          onChange={(e) =>
                            update("OPENAI_REALTIME_API_KEY", e.target.value)
                          }
                          className="flex-1 min-w-[200px] bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
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
                          className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
                        >
                          {testOpenAI.state === "testing"
                            ? "Testing…"
                            : "Test API key"}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        True LITE: this key is enough — server uses it to mint
                        ephemeral keys. LiveAvatar-managed: enter key and click
                        Register below.
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
                      <label className="block text-sm text-gray-400 mb-1">
                        Realtime model
                      </label>
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
                        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
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
                        className="mt-1 w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
                        placeholder="Or type model id (e.g. gpt-realtime)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Voice
                      </label>
                      <select
                        value={config.OPENAI_REALTIME_VOICE}
                        onChange={(e) =>
                          update("OPENAI_REALTIME_VOICE", e.target.value)
                        }
                        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
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
                        — Marin and Cedar recommended. True LITE: Nova, Fable,
                        Onyx are not supported by the Realtime API and will use
                        Marin.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        System instructions
                      </label>
                      <textarea
                        value={config.OPENAI_REALTIME_INSTRUCTIONS}
                        onChange={(e) =>
                          update("OPENAI_REALTIME_INSTRUCTIONS", e.target.value)
                        }
                        rows={4}
                        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
                        placeholder="e.g. You are a realtime voice AI. Personality: warm, witty; never claim to be human."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        True LITE: sent with the session. LiveAvatar-managed: we
                        send it but they may not forward it.
                      </p>
                    </div>
                    {config.USE_TRUE_LITE && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">
                          OpenAI Prompt ID (optional, True LITE only)
                        </label>
                        <input
                          type="text"
                          value={config.OPENAI_REALTIME_PROMPT_ID}
                          onChange={(e) =>
                            update("OPENAI_REALTIME_PROMPT_ID", e.target.value)
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
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
                          <label className="block text-sm text-gray-400 mb-1">
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
                            className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder-gray-500"
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
                            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
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
            className="px-6 py-2 rounded-md bg-white text-black font-medium disabled:opacity-50"
          >
            {saveStatus === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={saveStatus === "saving"}
            className="px-6 py-2 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50"
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
