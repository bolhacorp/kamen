"use client";

import { useEffect, useRef } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import { SessionState } from "@heygen/liveavatar-web-sdk";
import { logIara, logLiveAvatar } from "../pipeline-log";

const LIVEAVATAR_KEEP_ALIVE_MS = 2 * 60 * 1000; // 2 min

const IARA_SAMPLE_RATE = 24000;

export function useIaraRealtime(
  enabled: boolean,
  sessionRef: React.RefObject<LiveAvatarSession | null>,
  sessionState: SessionState,
  iaraWsUrl: string,
  iaraSystemPrompt?: string,
  iaraPresetId?: string,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const sessionReadyRef = useRef(false);
  const lastTextFrameRef = useRef<string | null>(null);
  const currentEventIdRef = useRef<string | null>(null);
  const ttsBufferRef = useRef<Uint8Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  useEffect(() => {
    if (
      !enabled ||
      sessionState !== SessionState.CONNECTED ||
      !sessionRef?.current ||
      !iaraWsUrl.trim()
    ) {
      logIara("useIaraRealtime skipped", "debug", {
        enabled,
        sessionState,
        hasSessionRef: !!sessionRef?.current,
        hasUrl: !!iaraWsUrl?.trim(),
      });
      return;
    }
    const session = sessionRef.current;
    let cancelled = false;
    const binaryChunkCountRef = { current: 0 };

    const flushTtsToLiveAvatar = (final: boolean) => {
      if (!sessionRef.current || cancelled) return;
      const chunks = ttsBufferRef.current;
      if (chunks.length === 0) return;
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        combined.set(c, offset);
        offset += c.length;
      }
      ttsBufferRef.current = [];
      let binary = "";
      for (let i = 0; i < combined.length; i++) {
        binary += String.fromCharCode(combined[i] ?? 0);
      }
      const base64 = btoa(binary);
      const eventId = currentEventIdRef.current;
      if (eventId) {
        session.sendAgentSpeakBase64(base64, eventId);
        logIara(
          "iara → LiveAvatar: agent.speak (chunk)",
          final ? "info" : "debug",
          {
            base64Length: base64.length,
            eventId,
            final,
          },
        );
      } else {
        session.stopListening();
        logLiveAvatar("iara: agent.stop_listening (before speak)", "debug");
        currentEventIdRef.current = session.sendAgentSpeakBase64(base64);
        logIara("iara → LiveAvatar: agent.speak (first chunk)", "info", {
          base64Length: base64.length,
          eventId: currentEventIdRef.current,
          final,
        });
      }
      if (final && currentEventIdRef.current) {
        session.sendAgentSpeakEnd(currentEventIdRef.current);
        logIara("iara → LiveAvatar: agent.speak_end", "info", {
          eventId: currentEventIdRef.current,
        });
        currentEventIdRef.current = null;
      }
    };

    const run = async () => {
      const url = iaraWsUrl.trim();
      logIara("iara WebSocket: connecting", "info", {
        url,
        readyState: "CONNECTING",
      });
      const ws = new WebSocket(url);
      wsRef.current = ws;
      logIara("iara WebSocket: instance created", "debug", {
        readyState: ws.readyState,
      });

      ws.onopen = () => {
        if (cancelled) return;
        logIara("iara WebSocket: open", "info", { readyState: ws.readyState });
        const firstMessage: {
          sample_rate: number;
          system_prompt?: string;
          preset_id?: string;
        } = { sample_rate: IARA_SAMPLE_RATE };
        if ((iaraSystemPrompt ?? "").trim())
          firstMessage.system_prompt = (iaraSystemPrompt ?? "").trim();
        if ((iaraPresetId ?? "").trim())
          firstMessage.preset_id = (iaraPresetId ?? "").trim();
        const firstPayload = JSON.stringify(firstMessage);
        ws.send(firstPayload);
        logIara("iara WebSocket: first message sent (text frame)", "info", {
          firstMessage,
          payloadLength: firstPayload.length,
        });
      };

      ws.onmessage = (event: MessageEvent) => {
        if (cancelled) return;
        if (typeof event.data === "string") {
          lastTextFrameRef.current = event.data;
          logIara("iara WebSocket: text frame received", "debug", {
            length: event.data.length,
            raw: event.data.slice(0, 300),
          });
          try {
            const data = JSON.parse(event.data) as {
              type?: string;
              event_id?: string;
              message?: string;
              code?: string;
              sample_rate?: number;
            };
            const type = data?.type;
            if (type === "session_ready") {
              sessionReadyRef.current = true;
              logIara("iara: session_ready", "info", {
                sample_rate: data.sample_rate,
              });
            } else if (type === "user_speech_started") {
              sessionRef.current?.startListening();
              logIara(
                "iara: user_speech_started → agent.start_listening",
                "info",
              );
            } else if (type === "user_speech_stopped") {
              sessionRef.current?.stopListening();
              logIara(
                "iara: user_speech_stopped → agent.stop_listening",
                "info",
              );
            } else if (type === "response_started") {
              const eventId = data?.event_id ?? null;
              currentEventIdRef.current = eventId;
              sessionRef.current?.stopListening();
              logIara("iara: response_started", "info", { event_id: eventId });
            } else if (type === "response_done") {
              const eventId = data?.event_id ?? null;
              if (ttsBufferRef.current.length > 0) {
                flushTtsToLiveAvatar(true);
              } else if (eventId && currentEventIdRef.current === eventId) {
                session.sendAgentSpeakEnd(eventId);
                logIara("iara → LiveAvatar: agent.speak_end", "info", {
                  eventId,
                });
                currentEventIdRef.current = null;
              }
              logIara("iara: response_done", "info", { event_id: eventId });
            } else if (type === "error") {
              logIara("iara: error (server)", "error", {
                message: data?.message,
                code: data?.code,
                fullPayload: data,
              });
            } else {
              logIara("iara WebSocket: unknown text type", "debug", {
                type: type ?? "missing",
                payload: data,
              });
            }
          } catch (parseErr) {
            logIara("iara WebSocket: text frame parse error", "warn", {
              raw: event.data.slice(0, 400),
              error:
                parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
          }
          return;
        }
        // Binary: TTS PCM 24kHz 16-bit LE mono
        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          const len = bytes.length;
          binaryChunkCountRef.current += 1;
          ttsBufferRef.current.push(bytes);
          const total = ttsBufferRef.current.reduce((a, c) => a + c.length, 0);
          logIara("iara WebSocket: binary frame received", "debug", {
            bytes: len,
            chunkIndex: binaryChunkCountRef.current,
            totalBuffered: total,
          });
          if (total >= 4800) {
            flushTtsToLiveAvatar(false);
          }
        } else if (event.data instanceof Blob) {
          const size = event.data.size;
          binaryChunkCountRef.current += 1;
          logIara("iara WebSocket: binary blob received", "debug", {
            size,
            chunkIndex: binaryChunkCountRef.current,
          });
          event.data.arrayBuffer().then((buf) => {
            if (cancelled) return;
            const bytes = new Uint8Array(buf);
            ttsBufferRef.current.push(bytes);
            const total = ttsBufferRef.current.reduce(
              (a, c) => a + c.length,
              0,
            );
            if (total >= 4800) {
              flushTtsToLiveAvatar(false);
            }
          });
        }
      };

      ws.onerror = (ev) => {
        if (!cancelled)
          logIara("iara WebSocket: error event", "error", {
            type: ev?.type ?? "error",
          });
      };
      ws.onclose = (ev) => {
        if (!cancelled) {
          logIara("iara WebSocket: closed", "info", {
            code: ev.code,
            reason: ev.reason || undefined,
            wasClean: ev.wasClean,
            hadSessionReady: sessionReadyRef.current,
          });
          if (lastTextFrameRef.current != null) {
            logIara(
              "iara WebSocket: last text frame before close",
              sessionReadyRef.current ? "debug" : "warn",
              { raw: lastTextFrameRef.current },
            );
          }
        }
        sessionReadyRef.current = false;
        wsRef.current = null;
      };

      // Mic → iara (binary PCM 24kHz 16-bit LE mono)
      const startMic = async () => {
        try {
          logIara("iara: requesting microphone (getUserMedia)", "info");
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const audioContext = new AudioContext();
          const sampleRate = audioContext.sampleRate;
          logIara("iara: microphone acquired, starting PCM pipeline", "info", {
            sampleRate,
            downsample: sampleRate === 48000 ? 2 : 1,
            targetRate: IARA_SAMPLE_RATE,
          });
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(audioContext.destination);
          const downsample = sampleRate === 48000 ? 2 : 1;
          processor.onaudioprocess = (e: AudioProcessingEvent) => {
            if (
              !wsRef.current ||
              wsRef.current.readyState !== WebSocket.OPEN ||
              !sessionReadyRef.current ||
              cancelled
            )
              return;
            const input = e.inputBuffer.getChannelData(0);
            const len =
              downsample === 2 ? Math.floor(input.length / 2) : input.length;
            const pcm16 = new Int16Array(len);
            for (let i = 0; i < len; i++) {
              const idx = downsample === 2 ? i * 2 : i;
              const s = Math.max(-1, Math.min(1, input[idx] ?? 0));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            wsRef.current.send(pcm16.buffer);
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logIara("iara: microphone failed", "error", { error: msg });
        }
      };

      // Start mic when session_ready (we set sessionReadyRef in onmessage)
      const checkReady = setInterval(() => {
        if (cancelled || !wsRef.current) {
          clearInterval(checkReady);
          return;
        }
        if (sessionReadyRef.current) {
          clearInterval(checkReady);
          logIara("iara: session_ready seen, starting mic", "info");
          startMic();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(checkReady);
        if (sessionReadyRef.current && streamRef.current === null) {
          logIara(
            "iara: session_ready seen (timeout path), starting mic",
            "info",
          );
          startMic();
        }
      }, 5000);

      keepAliveIntervalRef.current = setInterval(() => {
        if (sessionRef.current && !cancelled) {
          sessionRef.current.sendSessionKeepAliveWs();
          logIara("iara: LiveAvatar session.keep_alive sent", "debug");
        }
      }, LIVEAVATAR_KEEP_ALIVE_MS);
      logIara("iara: keep-alive timer started (every 2min)", "info");
    };

    run();
    return () => {
      cancelled = true;
      logIara("iara: cleanup (unmount/disable)", "info", {
        hadKeepAlive: !!keepAliveIntervalRef.current,
        hadStream: !!streamRef.current,
        hadWs: !!wsRef.current,
        wsReadyState: wsRef.current?.readyState ?? null,
      });
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        try {
          if (state === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "stop" }));
            logIara("iara: sent action: stop (clean disconnect)", "info");
          } else {
            logIara("iara: skip action: stop (ws not open)", "debug", {
              readyState: state,
            });
          }
        } catch (e) {
          logIara("iara: error sending stop on cleanup", "warn", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        wsRef.current.close();
        wsRef.current = null;
      }
      sessionReadyRef.current = false;
      ttsBufferRef.current = [];
      currentEventIdRef.current = null;
    };
  }, [
    enabled,
    sessionState,
    sessionRef,
    iaraWsUrl,
    iaraSystemPrompt,
    iaraPresetId,
  ]);
}
