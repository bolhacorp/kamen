"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import { SessionState } from "@heygen/liveavatar-web-sdk";
import { logOpenAI, logLiveAvatar } from "../pipeline-log";

/** ~1s of PCM 24kHz 16-bit mono in base64: 48000 bytes => 64000 chars. Flush when we have this much. */
const TARGET_CHUNK_BASE64_LEN = 60000;

const LIVEAVATAR_KEEP_ALIVE_MS = 2 * 60 * 1000; // 2 min

function isLiteVoiceActive(state: SessionState): boolean {
  return (
    state === SessionState.INACTIVE ||
    state === SessionState.CONNECTING ||
    state === SessionState.CONNECTED
  );
}

export function useTrueLiteRealtime(
  enabled: boolean,
  sessionRef: React.RefObject<LiveAvatarSession | null>,
  sessionState: SessionState,
  onRealtimeReady?: () => void,
  onRealtimeError?: (message: string) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioBufferRef = useRef<string>("");
  const currentEventIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const connectInFlightRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const deltaCountRef = useRef(0);
  const inputAppendCountRef = useRef(0);
  const onRealtimeReadyRef = useRef(onRealtimeReady);
  const onRealtimeErrorRef = useRef(onRealtimeError);
  const realtimeReadyCalledRef = useRef(false);
  const realtimeErrorReportedRef = useRef(false);
  const tornDownRef = useRef(false);
  onRealtimeReadyRef.current = onRealtimeReady;
  onRealtimeErrorRef.current = onRealtimeError;

  const resetRuntimeState = useCallback(() => {
    realtimeReadyCalledRef.current = false;
    realtimeErrorReportedRef.current = false;
    audioBufferRef.current = "";
    currentEventIdRef.current = null;
    deltaCountRef.current = 0;
    inputAppendCountRef.current = 0;
  }, []);

  const teardownRealtime = useCallback(() => {
    tornDownRef.current = true;
    connectInFlightRef.current = false;

    const ws = wsRef.current;
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
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

    resetRuntimeState();
  }, [resetRuntimeState]);

  const reportRealtimeError = useCallback(
    (message: string, details?: Record<string, unknown>) => {
      if (tornDownRef.current || realtimeErrorReportedRef.current) return;
      realtimeErrorReportedRef.current = true;
      logOpenAI("True LITE bootstrap failed", "error", {
        message,
        ...(details ?? {}),
      });
      onRealtimeErrorRef.current?.(message);
    },
    [],
  );

  // Teardown: close WS and clear refs only when leaving LITE voice flow (disabled or disconnected).
  useEffect(() => {
    if (enabled && sessionState !== SessionState.DISCONNECTED) return;
    teardownRealtime();
  }, [enabled, sessionState, teardownRealtime]);

  useEffect(() => {
    return () => {
      teardownRealtime();
    };
  }, [teardownRealtime]);

  useEffect(() => {
    if (!enabled || !isLiteVoiceActive(sessionState)) return;
    tornDownRef.current = false;
    if (sessionState === SessionState.INACTIVE) {
      resetRuntimeState();
    }

    let cancelled = false;

    const flushToLiveAvatar = (final: boolean) => {
      const s = sessionRef.current;
      if (!s || tornDownRef.current) return;
      if (s.state !== SessionState.CONNECTED) return;
      const buf = audioBufferRef.current;
      if (buf.length > 0) {
        const eventId = currentEventIdRef.current;
        if (!eventId) {
          s.stopListening();
          logLiveAvatar(
            "True LITE: agent.stop_listening (before speak)",
            "debug",
          );
          currentEventIdRef.current = s.sendAgentSpeakBase64(buf);
          logOpenAI("Orchestrator -> LiveAvatar: agent.speak (chunk)", "info", {
            base64Length: buf.length,
            eventId: currentEventIdRef.current,
            final,
          });
        } else {
          s.sendAgentSpeakBase64(buf, eventId);
          logOpenAI(
            "Orchestrator -> LiveAvatar: agent.speak (append)",
            "debug",
            {
              base64Length: buf.length,
              eventId,
              final,
            },
          );
        }
        audioBufferRef.current = "";
      }
      if (final && currentEventIdRef.current) {
        s.sendAgentSpeakEnd(currentEventIdRef.current);
        logOpenAI("Orchestrator -> LiveAvatar: agent.speak_end", "info", {
          eventId: currentEventIdRef.current,
        });
        currentEventIdRef.current = null;
      }
    };

    const run = async () => {
      if (wsRef.current || connectInFlightRef.current) return;
      connectInFlightRef.current = true;
      try {
        logOpenAI(
          "Requesting ephemeral key (POST /api/realtime/ephemeral-key)",
          "info",
        );
        const keyRes = await fetch("/api/realtime/ephemeral-key", {
          method: "POST",
        });
        if (cancelled) {
          connectInFlightRef.current = false;
          return;
        }
        if (!keyRes.ok) {
          const errBody = await keyRes.json().catch(() => ({}));
          const errorMessage =
            (errBody as { error?: string })?.error ?? keyRes.statusText;
          logOpenAI("Ephemeral key request failed", "error", {
            status: keyRes.status,
            error: errorMessage,
          });
          reportRealtimeError(`True LITE failed: ${errorMessage}`, {
            status: keyRes.status,
          });
          connectInFlightRef.current = false;
          return;
        }

        const keyData = (await keyRes.json().catch(() => ({}))) as {
          value?: string;
          model?: string;
        };
        const ephemeralKey = keyData.value;
        const model = keyData.model?.trim() || "gpt-realtime";
        if (!ephemeralKey || cancelled) {
          logOpenAI("Ephemeral key missing in response", "error", { keyData });
          reportRealtimeError("True LITE failed: ephemeral key was missing.");
          connectInFlightRef.current = false;
          return;
        }

        logOpenAI("Ephemeral key received (1min TTL)", "info", {
          keyPrefix: ephemeralKey.slice(0, 12) + "...",
          model,
        });

        const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
        logOpenAI("Connecting to OpenAI Realtime WebSocket", "info", {
          url: wsUrl,
          model,
        });
        // GA Realtime API: do not use openai-beta.realtime-v1 (would require beta client secret).
        const ws = new WebSocket(wsUrl, [
          "realtime",
          `openai-insecure-api-key.${ephemeralKey}`,
        ]);
        wsRef.current = ws;

        ws.onopen = () => {
          if (tornDownRef.current) return;
          connectInFlightRef.current = false;
          logOpenAI("WebSocket open", "info", { readyState: ws.readyState });
        };

        ws.onmessage = (event: MessageEvent) => {
          if (tornDownRef.current) return;
          try {
            const data = JSON.parse(event.data as string) as {
              type?: string;
              delta?: string;
              error?: { message?: string };
            };
            const type = data?.type;
            if (type === "response.output_audio.delta" && data?.delta != null) {
              audioBufferRef.current += data.delta;
              deltaCountRef.current += 1;
              if (audioBufferRef.current.length >= TARGET_CHUNK_BASE64_LEN) {
                flushToLiveAvatar(false);
              }
            } else if (
              type === "response.done" ||
              type === "response.output_audio.done"
            ) {
              if (deltaCountRef.current > 0) {
                logOpenAI(
                  "OpenAI -> Orchestrator: response output_audio done",
                  "info",
                  {
                    deltaCount: deltaCountRef.current,
                  },
                );
                deltaCountRef.current = 0;
              }
              flushToLiveAvatar(true);
            } else if (type === "response.created") {
              logOpenAI("OpenAI server event: response.created", "debug", {
                responseId: (data as { response?: { id?: string } }).response
                  ?.id,
              });
            } else if (type === "session.created") {
              logOpenAI(
                "OpenAI server event: session.created (realtime ready)",
                "info",
              );
              if (!realtimeReadyCalledRef.current) {
                realtimeReadyCalledRef.current = true;
                realtimeErrorReportedRef.current = false;
                onRealtimeReadyRef.current?.();
              }
            } else if (type === "session.updated") {
              logOpenAI("OpenAI server event: session.updated", "debug");
            } else if (type === "input_audio_buffer.speech_started") {
              logOpenAI(
                "OpenAI server event: input_audio_buffer.speech_started (user speech)",
                "info",
              );
              if (sessionRef.current?.state === SessionState.CONNECTED) {
                sessionRef.current.startListening();
                logLiveAvatar(
                  "True LITE: agent.start_listening (user speaking)",
                  "info",
                );
              }
            } else if (type === "input_audio_buffer.speech_stopped") {
              logOpenAI(
                "OpenAI server event: input_audio_buffer.speech_stopped (VAD)",
                "info",
              );
              if (sessionRef.current?.state === SessionState.CONNECTED) {
                sessionRef.current.stopListening();
                logLiveAvatar(
                  "True LITE: agent.stop_listening (user finished)",
                  "info",
                );
              }
            } else if (type === "error") {
              const err = data?.error?.message ?? "Unknown";
              logOpenAI("OpenAI server event: error", "error", {
                message: err,
                raw: data,
              });
              reportRealtimeError(`True LITE failed: ${err}`, { raw: data });
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          if (!tornDownRef.current) {
            logOpenAI("WebSocket error", "error");
            reportRealtimeError(
              "True LITE failed: could not connect to OpenAI Realtime.",
            );
          }
          connectInFlightRef.current = false;
        };
        ws.onclose = (ev) => {
          if (!tornDownRef.current) {
            logOpenAI("WebSocket closed", "info", {
              code: ev.code,
              reason: ev.reason || undefined,
              wasClean: ev.wasClean,
            });
            if (!realtimeReadyCalledRef.current) {
              const suffix = ev.reason
                ? ` (${ev.code}: ${ev.reason})`
                : ` (${ev.code})`;
              reportRealtimeError(
                `True LITE failed: OpenAI Realtime closed before session readiness${suffix}.`,
                {
                  code: ev.code,
                  reason: ev.reason || undefined,
                  wasClean: ev.wasClean,
                },
              );
            }
          }
          wsRef.current = null;
          connectInFlightRef.current = false;
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          logOpenAI("True LITE bootstrap threw", "error", { error: message });
          reportRealtimeError(`True LITE failed: ${message}`);
          connectInFlightRef.current = false;
        }
      }
    };

    // Connect when we don't have a WS yet (voice-first: connect while INACTIVE).
    if (!wsRef.current) {
      void run();
    }

    // Start mic and keepAlive only when LiveAvatar is CONNECTED (reuse same WS).
    const startPipelineWhenConnected = async () => {
      if (
        sessionState !== SessionState.CONNECTED ||
        !sessionRef.current ||
        !wsRef.current ||
        cancelled ||
        streamRef.current != null
      ) {
        return;
      }
      try {
        logOpenAI("Requesting microphone (getUserMedia)", "info");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const sampleRate = audioContext.sampleRate;
        logOpenAI("Microphone acquired, creating pipeline to OpenAI", "info", {
          sampleRate,
          downsample: sampleRate === 48000 ? 2 : 1,
        });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(audioContext.destination);
        const downsample = sampleRate === 48000 ? 2 : 1;
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (
            !wsRef.current ||
            wsRef.current.readyState !== WebSocket.OPEN ||
            cancelled ||
            tornDownRef.current
          ) {
            return;
          }
          const input = e.inputBuffer.getChannelData(0);
          const len =
            downsample === 2 ? Math.floor(input.length / 2) : input.length;
          const pcm16 = new Int16Array(len);
          for (let i = 0; i < len; i++) {
            const idx = downsample === 2 ? i * 2 : i;
            const s = Math.max(-1, Math.min(1, input[idx] ?? 0));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          const bytes = new Uint8Array(pcm16.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i] ?? 0);
          }
          const base64 = btoa(binary);
          wsRef.current.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64,
            }),
          );
          inputAppendCountRef.current += 1;
          if (inputAppendCountRef.current % 100 === 1) {
            logOpenAI(
              "Orchestrator -> OpenAI: input_audio_buffer.append (batched count)",
              "debug",
              {
                appendCount: inputAppendCountRef.current,
              },
            );
          }
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logOpenAI("Microphone failed", "error", { error: msg });
        reportRealtimeError(`True LITE microphone failed: ${msg}`);
        return;
      }

      keepAliveIntervalRef.current = setInterval(() => {
        if (sessionRef.current && !cancelled) {
          sessionRef.current.sendSessionKeepAliveWs();
          logOpenAI(
            "Orchestrator -> LiveAvatar: session.keep_alive sent",
            "debug",
          );
        }
      }, LIVEAVATAR_KEEP_ALIVE_MS);
      logOpenAI("Keep-alive timer started (every 2min)", "info");
    };

    if (
      sessionState === SessionState.CONNECTED &&
      sessionRef.current &&
      wsRef.current
    ) {
      void startPipelineWhenConnected();
    }

    return () => {
      cancelled = true;
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
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
      audioBufferRef.current = "";
      currentEventIdRef.current = null;
    };
  }, [
    enabled,
    sessionState,
    sessionRef,
    reportRealtimeError,
    resetRuntimeState,
  ]);
}
