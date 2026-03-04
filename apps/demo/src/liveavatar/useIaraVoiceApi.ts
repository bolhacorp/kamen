"use client";

import { useEffect, useRef } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import { SessionState } from "@heygen/liveavatar-web-sdk";
import { logIara, logLiveAvatar } from "../pipeline-log";

const LIVEAVATAR_KEEP_ALIVE_MS = 2 * 60 * 1000; // 2 min
const IARA_SAMPLE_RATE = 24000;
/** Require at least ~700 ms of PCM before sending a turn. */
const MIN_SEND_BYTES = 24_000 * 2 * 0.7; // 33_600
/** Max 30 s of PCM (match iara API limit). */
const MAX_SAMPLES = 24_000 * 30; // 720_000
/** Drop oversized TTS payloads to avoid client memory spikes. */
const DEFAULT_MAX_TTS_BYTES = 900_000;
const parsedClientMax = Number(
  process.env.NEXT_PUBLIC_IARA_MAX_TTS_BYTES ?? "",
);
const MAX_TTS_BYTES =
  Number.isFinite(parsedClientMax) && parsedClientMax > 0
    ? parsedClientMax
    : DEFAULT_MAX_TTS_BYTES;
const parsedServerCap = Number(
  process.env.NEXT_PUBLIC_IARA_SERVER_MAX_TTS_BYTES ?? "",
);
const SERVER_TTS_CAP_BOUNDARY =
  Number.isFinite(parsedServerCap) && parsedServerCap > 0
    ? parsedServerCap
    : DEFAULT_MAX_TTS_BYTES;
/** Send TTS to LiveAvatar in smaller chunks (~200 ms). */
const TTS_CHUNK_BYTES = 9_600;
/** Flush interval when we have at least MIN_SEND_BYTES. */
const SEND_INTERVAL_MS = 500;
/** Do not send more than one turn per second. */
const MIN_TURN_GAP_MS = 1000;
/** Wait this much silence before closing a speech turn (VAD hangover). */
const VAD_HANGOVER_MS = 450;
/** Keep listening indicator briefly after speech energy drops. */
const LISTENING_HOLD_MS = 450;
/** Simple level threshold for speech activity (RMS on normalized float samples). */
const VAD_RMS_THRESHOLD = 0.015;
/** Ignore ultra-short detected speech (likely noise/clicks). */
const MIN_SPEECH_MS = 600;

function readIaraTraceHeaders(headers: Headers): Record<string, string> {
  const trace: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "x-turn-id" || lower.startsWith("x-iara-")) {
      trace[lower] = value;
    }
  }
  return trace;
}

function logTurnDiagnostics(
  responseBytes: number,
  maxTtsBytes: number,
  traceHeaders: Record<string, string>,
) {
  logIara("iara Voice API: turn diagnostics", "info", {
    responseBytes,
    maxTtsBytes,
    stage: traceHeaders["x-iara-stage"],
    iaraResponseAudioBytes: traceHeaders["x-iara-response-audio-bytes"],
    iaraTtsTruncated: traceHeaders["x-iara-tts-truncated"],
    turnId: traceHeaders["x-turn-id"],
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function resampleTo24kMono(
  input: Float32Array,
  sourceRate: number,
): Float32Array {
  if (sourceRate === IARA_SAMPLE_RATE) return input;
  if (sourceRate <= 0 || input.length === 0) return new Float32Array();
  const outLen = Math.max(
    1,
    Math.floor((input.length * IARA_SAMPLE_RATE) / sourceRate),
  );
  const out = new Float32Array(outLen);
  const scale = sourceRate / IARA_SAMPLE_RATE;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * scale;
    const left = Math.floor(srcPos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = srcPos - left;
    const l = input[left] ?? 0;
    const r = input[right] ?? l;
    out[i] = l + (r - l) * frac;
  }
  return out;
}

export function useIaraVoiceApi(
  enabled: boolean,
  sessionRef: React.RefObject<LiveAvatarSession | null>,
  sessionState: SessionState,
) {
  const streamRef = useRef<MediaStream | null>(null);
  const bufferRef = useRef<number[]>([]);
  const inFlightRef = useRef(false);
  const speechStartedAtRef = useRef<number | null>(null);
  const lastSpeechAtRef = useRef(0);
  const lastSendAtRef = useRef(0);
  const avatarListeningRef = useRef(false);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  useEffect(() => {
    if (
      !enabled ||
      sessionState !== SessionState.CONNECTED ||
      !sessionRef?.current
    ) {
      logIara("useIaraVoiceApi skipped", "debug", {
        enabled,
        sessionState,
        hasSessionRef: !!sessionRef?.current,
      });
      return;
    }
    const session = sessionRef.current;
    let cancelled = false;

    const flushBuffer = (): Uint8Array | null => {
      if (bufferRef.current.length === 0) return null;
      const take = Math.min(bufferRef.current.length, MAX_SAMPLES);
      const out = new Uint8Array(take * 2);
      const view = new DataView(out.buffer);
      for (let i = 0; i < take; i++) {
        const s = Math.max(
          -32768,
          Math.min(32767, Math.round(bufferRef.current[i] ?? 0)),
        );
        view.setInt16(i * 2, s, true);
      }
      bufferRef.current = bufferRef.current.slice(take);
      return out;
    };

    const sendToVoiceApi = async (pcm: Uint8Array) => {
      if (inFlightRef.current || cancelled || !sessionRef.current) return;
      inFlightRef.current = true;
      lastSendAtRef.current = Date.now();
      if (avatarListeningRef.current) {
        sessionRef.current.stopListening();
        avatarListeningRef.current = false;
        logLiveAvatar(
          "iara Voice API: agent.stop_listening (turn send)",
          "debug",
        );
      }
      logIara("iara Voice API: sending PCM", "info", { bytes: pcm.length });

      try {
        const res = await fetch("/api/iara/voice", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: pcm,
        });
        const traceHeaders = readIaraTraceHeaders(res.headers);
        const turnId = res.headers.get("X-Turn-Id") ?? undefined;
        const arrayBuffer = await res.arrayBuffer();
        logTurnDiagnostics(arrayBuffer.byteLength, MAX_TTS_BYTES, traceHeaders);
        if (
          traceHeaders["x-iara-stage"] === "completed_truncated_tts" ||
          arrayBuffer.byteLength === SERVER_TTS_CAP_BOUNDARY
        ) {
          logIara(
            "Server truncated TTS due to ORCHESTRATOR_VOICE_API_MAX_TTS_BYTES",
            "warn",
            {
              responseBytes: arrayBuffer.byteLength,
              serverCapBoundary: SERVER_TTS_CAP_BOUNDARY,
              stage: traceHeaders["x-iara-stage"],
              iaraResponseAudioBytes:
                traceHeaders["x-iara-response-audio-bytes"],
              iaraTtsTruncated: traceHeaders["x-iara-tts-truncated"],
              turnId: traceHeaders["x-turn-id"],
            },
          );
        }
        if (cancelled || !sessionRef.current) return;

        if (!res.ok) {
          const text = new TextDecoder().decode(arrayBuffer);
          logIara("iara Voice API: error", "error", {
            status: res.status,
            detail: text?.slice(0, 300),
            traceHeaders,
            stage: traceHeaders["x-iara-stage"],
            requestAudioBytes: traceHeaders["x-iara-request-audio-bytes"],
            transcriptChars: traceHeaders["x-iara-transcript-chars"],
            sttLatencyMs: traceHeaders["x-iara-stt-latency-ms"],
          });
          inFlightRef.current = false;
          return;
        }

        if (arrayBuffer.byteLength === 0) {
          logIara("iara Voice API: empty TTS", "debug");
          inFlightRef.current = false;
          return;
        }

        if (arrayBuffer.byteLength > MAX_TTS_BYTES) {
          logIara("iara Voice API: oversized TTS dropped", "error", {
            responseBytes: arrayBuffer.byteLength,
            maxTtsBytes: MAX_TTS_BYTES,
            traceHeaders,
            stage: traceHeaders["x-iara-stage"],
          });
          inFlightRef.current = false;
          return;
        }

        const bytes = new Uint8Array(arrayBuffer);
        bufferRef.current = [];
        speechStartedAtRef.current = null;
        session.stopListening();
        avatarListeningRef.current = false;
        logLiveAvatar(
          "iara Voice API: agent.stop_listening (before speak)",
          "debug",
        );
        let eventId = turnId ?? "";
        for (let offset = 0; offset < bytes.length; offset += TTS_CHUNK_BYTES) {
          const chunk = bytes.subarray(
            offset,
            Math.min(offset + TTS_CHUNK_BYTES, bytes.length),
          );
          const chunkBase64 = uint8ToBase64(chunk);
          if (!eventId) {
            eventId = session.sendAgentSpeakBase64(chunkBase64);
          } else {
            session.sendAgentSpeakBase64(chunkBase64, eventId);
          }
        }
        session.sendAgentSpeakEnd(eventId);
        logIara(
          "iara Voice API → LiveAvatar: agent.speak + speak_end",
          "info",
          {
            responseBytes: arrayBuffer.byteLength,
            chunkBytes: TTS_CHUNK_BYTES,
            chunkCount: Math.ceil(bytes.length / TTS_CHUNK_BYTES),
            eventId,
            traceHeaders,
            stage: traceHeaders["x-iara-stage"],
            requestAudioBytes: traceHeaders["x-iara-request-audio-bytes"],
            transcriptChars: traceHeaders["x-iara-transcript-chars"],
            sttLatencyMs: traceHeaders["x-iara-stt-latency-ms"],
          },
        );
      } catch (e) {
        logIara("iara Voice API: request failed", "error", {
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        inFlightRef.current = false;
      }
    };

    const maybeSend = () => {
      if (cancelled || inFlightRef.current) return;
      const now = Date.now();
      if (now - lastSendAtRef.current < MIN_TURN_GAP_MS) return;
      if (lastSpeechAtRef.current === 0) return;
      if (now - lastSpeechAtRef.current < VAD_HANGOVER_MS) return;
      const speechStartedAt =
        speechStartedAtRef.current ?? lastSpeechAtRef.current;
      const speechMs = Math.max(0, lastSpeechAtRef.current - speechStartedAt);
      if (speechMs < MIN_SPEECH_MS) {
        bufferRef.current = [];
        speechStartedAtRef.current = null;
        lastSpeechAtRef.current = 0;
        return;
      }
      const pcm = flushBuffer();
      if (pcm && pcm.length >= MIN_SEND_BYTES) {
        speechStartedAtRef.current = null;
        lastSpeechAtRef.current = 0;
        sendToVoiceApi(pcm);
      } else if (pcm && pcm.length > 0) {
        // Put back
        const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        for (let i = 0; i < pcm.byteLength; i += 2) {
          bufferRef.current.push(view.getInt16(i, true));
        }
      }
    };

    const startMic = async () => {
      try {
        logIara("iara Voice API: requesting microphone", "info");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const audioContext = new AudioContext();
        const sampleRate = audioContext.sampleRate;
        logIara("iara Voice API: microphone acquired", "info", {
          sampleRate,
          targetRate: IARA_SAMPLE_RATE,
        });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (cancelled) return;
          const now = Date.now();
          if (bufferRef.current.length >= MAX_SAMPLES) return; // cap
          const input = e.inputBuffer.getChannelData(0);
          const resampled = resampleTo24kMono(input, sampleRate);
          const len = resampled.length;
          let energy = 0;
          for (let i = 0; i < len; i++) {
            const s = Math.max(-1, Math.min(1, resampled[i] ?? 0));
            energy += s * s;
            bufferRef.current.push(s < 0 ? s * 0x8000 : s * 0x7fff);
          }
          const rms = Math.sqrt(energy / Math.max(1, len));
          if (rms >= VAD_RMS_THRESHOLD) {
            lastSpeechAtRef.current = now;
            if (speechStartedAtRef.current == null)
              speechStartedAtRef.current = now;
            if (!avatarListeningRef.current && sessionRef.current) {
              sessionRef.current.startListening();
              avatarListeningRef.current = true;
              logLiveAvatar("iara Voice API: agent.start_listening", "debug");
            }
          } else if (
            avatarListeningRef.current &&
            now - lastSpeechAtRef.current > LISTENING_HOLD_MS &&
            sessionRef.current
          ) {
            sessionRef.current.stopListening();
            avatarListeningRef.current = false;
            logLiveAvatar(
              "iara Voice API: agent.stop_listening (silence)",
              "debug",
            );
          }
        };

        sendIntervalRef.current = setInterval(maybeSend, SEND_INTERVAL_MS);
        logIara("iara Voice API: send timer started", "info", {
          intervalMs: SEND_INTERVAL_MS,
          minBytes: MIN_SEND_BYTES,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logIara("iara Voice API: microphone failed", "error", { error: msg });
      }
    };

    startMic();

    keepAliveIntervalRef.current = setInterval(() => {
      if (sessionRef.current && !cancelled) {
        sessionRef.current.sendSessionKeepAliveWs();
        logIara("iara Voice API: session.keep_alive sent", "debug");
      }
    }, LIVEAVATAR_KEEP_ALIVE_MS);

    return () => {
      cancelled = true;
      logIara("iara Voice API: cleanup", "info");
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (avatarListeningRef.current && sessionRef.current) {
        sessionRef.current.stopListening();
        avatarListeningRef.current = false;
      }
      bufferRef.current = [];
      speechStartedAtRef.current = null;
      lastSpeechAtRef.current = 0;
      lastSendAtRef.current = 0;
    };
  }, [enabled, sessionState, sessionRef]);
}
