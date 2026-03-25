"use client";

import { useEffect, useRef } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import { SessionState } from "@heygen/liveavatar-web-sdk";
import { createAvatarAecMicCaptureGraph } from "../audio/avatarAecGraph";
import { logIara, logLiveAvatar } from "../pipeline-log";

const IARA_SAMPLE_RATE = 24000;
const LIVEAVATAR_KEEP_ALIVE_MS = 2 * 60 * 1000;
const VAD_RMS_THRESHOLD = 0.015;
const VAD_HANGOVER_MS = 450;
const MIN_SPEECH_MS = 600;
const MIN_APPEND_BYTES = 4_800; // ~100 ms @ 24k mono int16

type IaraTurnState = {
  turnId: string | null;
  eventId: string | null;
  startedAtMs: number;
  sttChars: number;
  llmChunkCount: number;
  ttsChunksPlayed: number;
  totalBytesPlayed: number;
  truncated: boolean;
  cancelled: boolean;
  speakEndSent: boolean;
  chunksReceived: number;
  chunksDispatched: number;
  droppedChunks: number;
};

function buildSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `iara-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
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

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
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

function floatToPcm16LeBytes(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, Math.round(v), true);
  }
  return out;
}

function firstBytesHex(bytes: Uint8Array, count = 16): string {
  return Array.from(bytes.slice(0, count))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function drainContiguousSentenceOrder(
  bucket: Map<number, Uint8Array[]>,
  startSentenceIndex: number | null,
): {
  drained: Array<{ sentenceIndex: number; chunk: Uint8Array }>;
  next: number | null;
} {
  if (startSentenceIndex == null) return { drained: [], next: null };
  const drained: Array<{ sentenceIndex: number; chunk: Uint8Array }> = [];
  let next = startSentenceIndex;
  while (bucket.has(next)) {
    const chunks = bucket.get(next) ?? [];
    bucket.delete(next);
    for (const chunk of chunks) drained.push({ sentenceIndex: next, chunk });
    next += 1;
  }
  return { drained, next };
}

function isIaraVoiceActive(state: SessionState): boolean {
  return (
    state === SessionState.INACTIVE ||
    state === SessionState.CONNECTING ||
    state === SessionState.CONNECTED
  );
}

export type IaraVoiceWsOptions = {
  aecEnabled?: boolean;
  playbackVideoRef?: React.RefObject<HTMLVideoElement | null>;
};

export function useIaraVoiceWs(
  enabled: boolean,
  wsUrl: string,
  sessionRef: React.RefObject<LiveAvatarSession | null>,
  sessionState: SessionState,
  iaraSystemPrompt?: string,
  iaraPresetId?: string,
  onIaraReady?: () => void,
  options?: IaraVoiceWsOptions,
) {
  const aecEnabled = options?.aecEnabled === true;
  const playbackVideoRef = options?.playbackVideoRef;
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const onIaraReadyRef = useRef(onIaraReady);
  const iaraReadyCalledRef = useRef(false);
  const tornDownRef = useRef(false);
  const aecDisposeRef = useRef<(() => void) | null>(null);
  onIaraReadyRef.current = onIaraReady;

  const iaraSessionIdRef = useRef<string>(buildSessionId());
  const turnRef = useRef<IaraTurnState>({
    turnId: null,
    eventId: null,
    startedAtMs: 0,
    sttChars: 0,
    llmChunkCount: 0,
    ttsChunksPlayed: 0,
    totalBytesPlayed: 0,
    truncated: false,
    cancelled: false,
    speakEndSent: false,
    chunksReceived: 0,
    chunksDispatched: 0,
    droppedChunks: 0,
  });

  const sentenceMapRef = useRef<Map<number, Uint8Array[]>>(new Map());
  const nextSentenceIndexRef = useRef<number | null>(null);
  const queueDepthRef = useRef(0);
  const playbackStartedAtRef = useRef<number | null>(null);
  const bargeInCountRef = useRef(0);
  const turnCompletedRef = useRef(false);

  // Teardown: close WS only when leaving iara flow (disabled or disconnected).
  useEffect(() => {
    if (enabled && sessionState !== SessionState.DISCONNECTED) return;
    tornDownRef.current = true;
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    iaraReadyCalledRef.current = false;
    if (aecDisposeRef.current) {
      try {
        aecDisposeRef.current();
      } catch {
        // ignore
      }
      aecDisposeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [enabled, sessionState]);

  useEffect(() => {
    if (!enabled || !isIaraVoiceActive(sessionState)) return;
    const url = wsUrl.trim();
    if (!url) return;
    if (
      sessionState === SessionState.CONNECTED &&
      (!sessionRef.current || !wsRef.current)
    )
      return;

    tornDownRef.current = false;
    let speaking = false;
    let speechStartedAt = 0;
    let lastSpeechAt = 0;
    let appendedBytesThisTurn = 0;
    let cancelSentForCurrentTurn = false;

    const resetTurnPlaybackState = () => {
      sentenceMapRef.current.clear();
      nextSentenceIndexRef.current = null;
      queueDepthRef.current = 0;
      playbackStartedAtRef.current = null;
      turnCompletedRef.current = false;
      cancelSentForCurrentTurn = false;
    };

    const resetTurnCounters = () => {
      const turn = turnRef.current;
      turn.chunksReceived = 0;
      turn.chunksDispatched = 0;
      turn.droppedChunks = 0;
    };

    const maybeSendSpeakEnd = () => {
      const turn = turnRef.current;
      if (turn.speakEndSent || !turn.eventId) return;
      if (!turnCompletedRef.current) return;
      if (queueDepthRef.current > 0) return;
      if (sessionRef.current?.state !== SessionState.CONNECTED) return;
      sessionRef.current.sendAgentSpeakEnd(turn.eventId);
      turn.speakEndSent = true;
      logIara("iara.ws turn.completed.summary", "info", {
        type: "turn.completed",
        turn_id: turn.turnId,
        session_id: iaraSessionIdRef.current,
        stt_text_length: turn.sttChars,
        llm_chunk_count: turn.llmChunkCount,
        tts_chunks_played: turn.ttsChunksPlayed,
        chunks_received: turn.chunksReceived,
        chunks_dispatched: turn.chunksDispatched,
        dropped_chunks: turn.droppedChunks,
        total_bytes: turn.totalBytesPlayed,
        truncated: turn.truncated,
        cancelled: turn.cancelled,
        barge_in_count: bargeInCountRef.current,
        speakEndCalled: turn.speakEndSent,
      });
    };

    const flushPlayback = () => {
      if (tornDownRef.current || !sessionRef.current) return;
      if (sessionRef.current?.state !== SessionState.CONNECTED) return;
      const turn = turnRef.current;
      const { drained, next } = drainContiguousSentenceOrder(
        sentenceMapRef.current,
        nextSentenceIndexRef.current,
      );
      nextSentenceIndexRef.current = next;
      for (const { sentenceIndex, chunk } of drained) {
        if (playbackStartedAtRef.current == null) {
          playbackStartedAtRef.current = Date.now();
        }
        const base64 = uint8ToBase64(chunk);
        const s = sessionRef.current;
        if (!s) return;
        if (!turn.eventId) {
          // Let LiveAvatar SDK create the canonical event id for playback.
          // iara turn_id is tracked separately for logs/cancel semantics.
          turn.eventId = s.sendAgentSpeakBase64(base64);
        } else {
          s.sendAgentSpeakBase64(base64, turn.eventId);
        }
        turn.ttsChunksPlayed += 1;
        turn.chunksDispatched += 1;
        turn.totalBytesPlayed += chunk.byteLength;
        queueDepthRef.current = Math.max(0, queueDepthRef.current - 1);
        logIara("iara.ws tts.audio.dispatched", "debug", {
          type: "tts.audio",
          turn_id: turn.turnId,
          session_id: iaraSessionIdRef.current,
          sentence_index: sentenceIndex,
          received_bytes: chunk.byteLength,
          decoded_bytes: chunk.byteLength,
          dispatched_bytes: chunk.byteLength,
          queue_depth: queueDepthRef.current,
          event_id: turn.eventId,
          playback_start_ms:
            playbackStartedAtRef.current != null
              ? playbackStartedAtRef.current - turn.startedAtMs
              : null,
          barge_in_count: bargeInCountRef.current,
        });
      }
      maybeSendSpeakEnd();
    };

    const cancelCurrentTurn = (reason: string) => {
      const turn = turnRef.current;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (cancelSentForCurrentTurn) return;
      if (!turn.turnId && !turn.eventId) return;
      wsRef.current.send(
        JSON.stringify({
          type: "turn.cancel",
          session_id: iaraSessionIdRef.current,
          turn_id: turn.turnId ?? undefined,
        }),
      );
      cancelSentForCurrentTurn = true;
      bargeInCountRef.current += 1;
      turn.cancelled = true;
      sentenceMapRef.current.clear();
      queueDepthRef.current = 0;
      turnCompletedRef.current = true;
      if (
        turn.eventId &&
        !turn.speakEndSent &&
        sessionRef.current?.state === SessionState.CONNECTED
      ) {
        sessionRef.current.sendAgentSpeakEnd(turn.eventId);
        turn.speakEndSent = true;
      }
      logIara("iara.ws turn.cancel.sent", "warn", {
        type: "turn.cancel",
        reason,
        turn_id: turn.turnId,
        session_id: iaraSessionIdRef.current,
        barge_in_count: bargeInCountRef.current,
      });
    };

    const commitTurn = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (appendedBytesThisTurn < MIN_APPEND_BYTES) {
        appendedBytesThisTurn = 0;
        return;
      }
      const payload: Record<string, unknown> = {
        type: "turn.commit",
        session_id: iaraSessionIdRef.current,
      };
      if ((iaraPresetId ?? "").trim()) payload.preset_id = iaraPresetId?.trim();
      if ((iaraSystemPrompt ?? "").trim())
        payload.system_prompt = iaraSystemPrompt?.trim();
      wsRef.current.send(JSON.stringify(payload));
      appendedBytesThisTurn = 0;
      speaking = false;
      speechStartedAt = 0;
      lastSpeechAt = 0;
      if (sessionRef.current?.state === SessionState.CONNECTED) {
        sessionRef.current.stopListening();
        logLiveAvatar("iara.ws agent.stop_listening (turn.commit)", "debug");
      }
      logIara("iara.ws turn.commit.sent", "info", {
        type: "turn.commit",
        session_id: iaraSessionIdRef.current,
        preset_id: payload.preset_id ?? null,
      });
    };

    const connectWs = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (tornDownRef.current) return;
        logIara("iara.ws connected (voice ready)", "info", {
          url,
          session_id: iaraSessionIdRef.current,
        });
        if (!iaraReadyCalledRef.current) {
          iaraReadyCalledRef.current = true;
          onIaraReadyRef.current?.();
        }
      };

      ws.onmessage = (event) => {
        if (tornDownRef.current) return;
        if (typeof event.data !== "string") return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(data.type ?? "");
        const turn = turnRef.current;
        if (!type) return;
        if (type === "turn.started") {
          turn.turnId = typeof data.turn_id === "string" ? data.turn_id : null;
          turn.eventId = null;
          turn.startedAtMs = Date.now();
          turn.sttChars = 0;
          turn.llmChunkCount = 0;
          turn.ttsChunksPlayed = 0;
          turn.totalBytesPlayed = 0;
          turn.truncated = false;
          turn.cancelled = false;
          turn.speakEndSent = false;
          resetTurnCounters();
          resetTurnPlaybackState();
        } else if (type === "stt.final") {
          const text =
            typeof data.text === "string"
              ? data.text
              : typeof data.transcript === "string"
                ? data.transcript
                : "";
          turn.sttChars = text.length;
        } else if (type === "llm.chunk") {
          turn.llmChunkCount += 1;
        } else if (type === "tts.audio") {
          const eventTurnId =
            typeof data.turn_id === "string" ? data.turn_id : null;
          if (eventTurnId && turn.turnId && eventTurnId !== turn.turnId) {
            turn.droppedChunks += 1;
            logIara("iara.ws tts.audio dropped", "warn", {
              reason: "wrong_turn_id",
              expected_turn_id: turn.turnId,
              received_turn_id: eventTurnId,
              session_id: iaraSessionIdRef.current,
            });
            return;
          }
          const sentenceIndex = Number(data.sentence_index ?? 0);
          const audioBase64 =
            typeof data.audio_base64 === "string" ? data.audio_base64 : "";
          if (!audioBase64 || audioBase64.length === 0) {
            turn.droppedChunks += 1;
            logIara("iara.ws tts.audio dropped", "warn", {
              reason: "missing_audio_base64",
              turn_id: turn.turnId,
              sentence_index: sentenceIndex,
              session_id: iaraSessionIdRef.current,
            });
            return;
          }
          if (!Number.isFinite(sentenceIndex)) {
            turn.droppedChunks += 1;
            logIara("iara.ws tts.audio dropped", "warn", {
              reason: "invalid_sentence_index",
              turn_id: turn.turnId,
              session_id: iaraSessionIdRef.current,
            });
            return;
          }
          let bytes: Uint8Array;
          try {
            bytes = base64ToUint8(audioBase64);
          } catch (err) {
            turn.droppedChunks += 1;
            logIara("iara.ws tts.audio dropped", "warn", {
              reason: "decode_fail",
              turn_id: turn.turnId,
              sentence_index: sentenceIndex,
              session_id: iaraSessionIdRef.current,
              error: err instanceof Error ? err.message : String(err),
            });
            return;
          }
          if (bytes.byteLength === 0) {
            turn.droppedChunks += 1;
            logIara("iara.ws tts.audio dropped", "warn", {
              reason: "decoded_empty",
              turn_id: turn.turnId,
              sentence_index: sentenceIndex,
              session_id: iaraSessionIdRef.current,
            });
            return;
          }
          if (bytes.byteLength % 2 !== 0) {
            turn.droppedChunks += 1;
            logIara("iara.ws tts.audio dropped", "warn", {
              reason: "pcm_not_int16_aligned",
              turn_id: turn.turnId,
              sentence_index: sentenceIndex,
              session_id: iaraSessionIdRef.current,
              decoded_bytes: bytes.byteLength,
            });
            return;
          }
          if (nextSentenceIndexRef.current == null) {
            nextSentenceIndexRef.current = sentenceIndex;
          }
          const existing = sentenceMapRef.current.get(sentenceIndex) ?? [];
          existing.push(bytes);
          sentenceMapRef.current.set(sentenceIndex, existing);
          queueDepthRef.current += 1;
          turn.chunksReceived += 1;
          logIara("iara.ws tts.audio.received", "debug", {
            type,
            turn_id: turn.turnId,
            session_id: iaraSessionIdRef.current,
            sentence_index: sentenceIndex,
            sample_rate:
              typeof data.sample_rate === "number"
                ? data.sample_rate
                : IARA_SAMPLE_RATE,
            received_bytes:
              typeof data.audio_bytes === "number"
                ? data.audio_bytes
                : bytes.byteLength,
            decoded_bytes: bytes.byteLength,
            first_16_hex: firstBytesHex(bytes, 16),
            queue_depth: queueDepthRef.current,
            event_id: turn.eventId,
            playback_start_ms:
              playbackStartedAtRef.current != null
                ? playbackStartedAtRef.current - turn.startedAtMs
                : null,
            barge_in_count: bargeInCountRef.current,
          });
          flushPlayback();
        } else if (type === "tts.truncated") {
          turn.truncated = true;
        } else if (type === "turn.cancelled") {
          turn.cancelled = true;
          turnCompletedRef.current = true;
          maybeSendSpeakEnd();
        } else if (type === "turn.completed") {
          turnCompletedRef.current = true;
          maybeSendSpeakEnd();
        } else if (type === "session.reset.completed") {
          logIara("iara.ws session.reset.completed", "info", {
            session_id: iaraSessionIdRef.current,
          });
        } else if (type === "error") {
          const message =
            typeof data.message === "string" ? data.message : "iara ws error";
          const code = typeof data.code === "string" ? data.code : undefined;
          logIara("iara.ws error event", "error", {
            type,
            turn_id: turn.turnId,
            session_id: iaraSessionIdRef.current,
            code,
            message,
            payload: data,
          });
          // Keep the hook healthy for next turn even after upstream failure.
          turnCompletedRef.current = true;
          sentenceMapRef.current.clear();
          queueDepthRef.current = 0;
          maybeSendSpeakEnd();
        }
      };

      ws.onclose = (ev) => {
        if (tornDownRef.current) return;
        logIara("iara.ws closed", "warn", {
          code: ev.code,
          reason: ev.reason || undefined,
          session_id: iaraSessionIdRef.current,
        });
      };

      ws.onerror = () => {
        if (tornDownRef.current) return;
        logIara("iara.ws error", "error", {
          session_id: iaraSessionIdRef.current,
        });
      };
    };

    if (!wsRef.current) {
      connectWs();
    }

    const bindMicProcessor = (
      processor: ScriptProcessorNode,
      sampleRate: number,
    ) => {
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (
          tornDownRef.current ||
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN
        )
          return;
        const now = Date.now();
        const input = e.inputBuffer.getChannelData(0);
        const resampled = resampleTo24kMono(input, sampleRate);
        if (resampled.length === 0) return;

        let energy = 0;
        for (let i = 0; i < resampled.length; i++) {
          const s = resampled[i] ?? 0;
          energy += s * s;
        }
        const rms = Math.sqrt(energy / resampled.length);
        const isSpeech = rms >= VAD_RMS_THRESHOLD;

        if (isSpeech) {
          if (!speaking) {
            speaking = true;
            speechStartedAt = now;
            const s = sessionRef.current;
            if (s?.state === SessionState.CONNECTED) {
              s.startListening();
              logLiveAvatar("iara.ws agent.start_listening", "debug");
            }
          }
          lastSpeechAt = now;
        }

        const turn = turnRef.current;
        const avatarPlaying = !!turn.eventId && !turn.speakEndSent;
        if (isSpeech && avatarPlaying) {
          cancelCurrentTurn("barge-in");
        }

        const inSpeechWindow =
          speaking ||
          (lastSpeechAt > 0 && now - lastSpeechAt <= VAD_HANGOVER_MS);
        if (!inSpeechWindow) return;

        const pcmBytes = floatToPcm16LeBytes(resampled);
        wsRef.current.send(pcmBytes.buffer);
        appendedBytesThisTurn += pcmBytes.byteLength;

        if (
          speaking &&
          lastSpeechAt > 0 &&
          now - lastSpeechAt > VAD_HANGOVER_MS
        ) {
          if (now - speechStartedAt >= MIN_SPEECH_MS) {
            commitTurn();
          } else {
            speaking = false;
            appendedBytesThisTurn = 0;
            const s = sessionRef.current;
            if (s?.state === SessionState.CONNECTED) {
              s.stopListening();
              logLiveAvatar(
                "iara.ws agent.stop_listening (short speech drop)",
                "debug",
              );
            }
          }
        }
      };
    };

    const startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (tornDownRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const videoEl = playbackVideoRef?.current ?? null;
        if (aecEnabled && !videoEl) {
          logIara(
            "iara.ws: avatar AEC enabled but video element missing; legacy mic path",
            "warn",
          );
        }

        let processor: ScriptProcessorNode | null = null;
        let sampleRate = 48000;

        if (aecEnabled && videoEl) {
          const graph = await createAvatarAecMicCaptureGraph(stream, videoEl);
          if (graph && tornDownRef.current) {
            graph.dispose();
            void graph.audioContext.close().catch(() => {});
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          if (graph && !tornDownRef.current) {
            aecDisposeRef.current = graph.dispose;
            audioContextRef.current = graph.audioContext;
            processorRef.current = graph.processor;
            sourceRef.current = null;
            processor = graph.processor;
            sampleRate = graph.audioContext.sampleRate;
            logIara("iara.ws: microphone with avatar-referenced AEC", "info", {
              sampleRate,
            });
            bindMicProcessor(processor, sampleRate);
          } else if (aecEnabled) {
            logIara(
              "iara.ws: AEC graph failed; using legacy mic path",
              "warn",
              { hasVideo: !!videoEl },
            );
          }
        }

        if (!processor) {
          aecDisposeRef.current = null;
          const audioContext = new AudioContext();
          audioContextRef.current = audioContext;
          sampleRate = audioContext.sampleRate;
          const source = audioContext.createMediaStreamSource(stream);
          const sp = audioContext.createScriptProcessor(4096, 1, 1);
          sourceRef.current = source;
          processorRef.current = sp;
          source.connect(sp);
          sp.connect(audioContext.destination);
          bindMicProcessor(sp, sampleRate);
        }
      } catch (err) {
        logIara("iara.ws microphone failed", "error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    if (
      sessionState === SessionState.CONNECTED &&
      sessionRef.current &&
      wsRef.current &&
      !streamRef.current
    ) {
      startMic();
      keepAliveIntervalRef.current = setInterval(() => {
        if (sessionRef.current && !tornDownRef.current) {
          sessionRef.current.sendSessionKeepAliveWs();
        }
      }, LIVEAVATAR_KEEP_ALIVE_MS);
    }

    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      if (aecDisposeRef.current) {
        try {
          aecDisposeRef.current();
        } catch {
          // ignore
        }
        aecDisposeRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch {
          // ignore
        }
        processorRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          // ignore
        }
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      // Do not close WS here; teardown effect handles it when DISCONNECTED.
    };
  }, [
    enabled,
    wsUrl,
    sessionRef,
    sessionState,
    iaraPresetId,
    iaraSystemPrompt,
    aecEnabled,
    playbackVideoRef,
  ]);
}
