"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useTextChat,
  useVoiceChat,
  useTrueLiteRealtime,
  useIaraVoiceWs,
  useIaraVoiceApi,
  useLiveAvatarContext,
} from "../liveavatar";
import { SessionState, VoiceChatConfig } from "@heygen/liveavatar-web-sdk";
import { useAvatarActions } from "../liveavatar/useAvatarActions";
import { Header } from "./Header";
import { Loading } from "./Loading";
import type { SessionMode } from "./LiveAvatarDemo";

const Button: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-white text-black px-4 py-2 rounded-md"
    >
      {children}
    </button>
  );
};

function resolveIaraVoiceWsUrl(
  iaraWsUrl?: string,
  iaraApiUrl?: string,
): string {
  const direct = (iaraWsUrl ?? "").trim();
  if (direct) return direct;

  const api = (iaraApiUrl ?? "").trim();
  if (!api) return "";

  const noTrailing = api.replace(/\/$/, "");
  if (noTrailing.endsWith("/api/voice/ws")) return noTrailing;
  if (noTrailing.endsWith("/api/voice")) {
    const base = noTrailing.slice(0, -"/api/voice".length);
    return base.replace(/^http(s?):\/\//, "ws$1://") + "/api/voice/ws";
  }
  return noTrailing.replace(/^http(s?):\/\//, "ws$1://") + "/api/voice/ws";
}

const LiveAvatarSessionComponent: React.FC<{
  mode: SessionMode;
  onSessionStopped: () => void;
  iaraWsUrl?: string;
  iaraApiUrl?: string;
  iaraSystemPrompt?: string;
  iaraPresetId?: string;
}> = ({
  mode,
  onSessionStopped,
  iaraWsUrl,
  iaraApiUrl,
  iaraSystemPrompt,
  iaraPresetId,
}) => {
  const [message, setMessage] = useState("");
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [iaraReady, setIaraReady] = useState(false);
  const {
    sessionState,
    isStreamReady,
    startSession,
    stopSession,
    connectionQuality,
    keepAlive,
    attachElement,
  } = useSession();
  const { sessionRef } = useLiveAvatarContext();
  const wsEnabled = process.env.NEXT_PUBLIC_IARA_USE_VOICE_WS !== "false";
  const resolvedIaraVoiceWsUrl = resolveIaraVoiceWsUrl(iaraWsUrl, iaraApiUrl);

  const handleRealtimeReady = React.useCallback(
    () => setRealtimeReady(true),
    [],
  );
  const handleIaraReady = React.useCallback(() => setIaraReady(true), []);

  useTrueLiteRealtime(
    mode === "LITE_TRUE",
    sessionRef,
    sessionState,
    handleRealtimeReady,
  );
  useIaraVoiceWs(
    mode === "LITE_IARA" && wsEnabled && !!resolvedIaraVoiceWsUrl,
    resolvedIaraVoiceWsUrl,
    sessionRef,
    sessionState,
    iaraSystemPrompt,
    iaraPresetId,
    handleIaraReady,
  );
  useIaraVoiceApi(
    mode === "LITE_IARA" &&
      (!wsEnabled || !resolvedIaraVoiceWsUrl) &&
      !!iaraApiUrl,
    sessionRef,
    sessionState,
    handleIaraReady,
  );
  const {
    isAvatarTalking,
    isUserTalking,
    isMuted,
    isActive,
    isLoading,
    start,
    stop,
    mute,
    unmute,
    startPushToTalk,
    stopPushToTalk,
    error: voiceChatError,
  } = useVoiceChat();

  // For useAvatarActions, treat FULL_PTT as FULL and LITE_TRUE/LITE_IARA as LITE
  const avatarActionsMode =
    mode === "FULL_PTT"
      ? "FULL"
      : mode === "LITE_TRUE" || mode === "LITE_IARA"
        ? "LITE"
        : mode;
  const { interrupt, repeat, startListening, stopListening } =
    useAvatarActions(avatarActionsMode);

  // For useTextChat, treat FULL_PTT as FULL and LITE_TRUE/LITE_IARA as LITE
  const textChatMode =
    mode === "FULL_PTT"
      ? "FULL"
      : mode === "LITE_TRUE" || mode === "LITE_IARA"
        ? "LITE"
        : mode;
  const { sendMessage } = useTextChat(textChatMode);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
    }
  }, [attachElement, isStreamReady]);

  // For LITE_TRUE and LITE_IARA, wait for voice "ready" before starting LiveAvatar.
  const canStartSession =
    sessionState === SessionState.INACTIVE &&
    (mode === "FULL" ||
      mode === "FULL_PTT" ||
      mode === "LITE" ||
      (mode === "LITE_TRUE" && realtimeReady) ||
      (mode === "LITE_IARA" && iaraReady));

  useEffect(() => {
    if (canStartSession) {
      startSession();
    }
  }, [startSession, canStartSession]);

  const VoiceChatComponents = (
    <>
      <p>Voice Chat Active: {isActive ? "true" : "false"}</p>
      <p>Voice Chat Loading: {isLoading ? "true" : "false"}</p>
      {voiceChatError && (
        <p className="text-red-500">Voice Chat Error: {voiceChatError}</p>
      )}
      {isActive && <p>Muted: {isMuted ? "true" : "false"}</p>}
      <Button
        onClick={() => {
          if (isActive) {
            stop();
          } else {
            start();
          }
        }}
        disabled={isLoading}
      >
        {isActive ? "Stop Voice Chat" : "Start Voice Chat"}
      </Button>
      {isActive && (
        <Button
          onClick={() => {
            if (isMuted) {
              unmute();
            } else {
              mute();
            }
          }}
        >
          {isMuted ? "Unmute" : "Mute"}
        </Button>
      )}
      <div className="flex flex-row items-center justify-center gap-4">
        <Button onClick={startListening}>Start Listening</Button>
        <Button onClick={stopListening}>Stop Listening</Button>
      </div>
    </>
  );

  const PushToTalkComponents = (
    <div className="flex flex-row items-center justify-center gap-4">
      <Button
        onClick={() => {
          startListening();
          startPushToTalk();
        }}
      >
        Start Push to Talk
      </Button>
      <Button
        onClick={() => {
          stopPushToTalk();
          stopListening();
        }}
      >
        Stop Push to Talk
      </Button>
    </div>
  );

  const voiceConnecting =
    (mode === "LITE_TRUE" &&
      sessionState === SessionState.INACTIVE &&
      !realtimeReady) ||
    (mode === "LITE_IARA" &&
      sessionState === SessionState.INACTIVE &&
      !iaraReady);

  return (
    <div className="conversation-screen">
      <Header />
      {voiceConnecting ? (
        <div className="loading-transition">
          <Loading />
          <p className="mt-4 text-center text-sm opacity-80">Loading voice…</p>
        </div>
      ) : !isStreamReady ? (
        <Loading />
      ) : (
        <>
          <div className="video-container video-fade-in">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              className="fullscreen-video"
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
          <button
            className="end-conversation-button"
            onClick={() => stopSession()}
          >
            Encerrar conversa
          </button>
        </>
      )}
      {/* Elementos ocultos - mantendo lógica funcional */}
      <div className="hidden-controls" style={{ display: "none" }}>
        <p>Session state: {sessionState}</p>
        <p>Connection quality: {connectionQuality}</p>
        {(mode === "FULL" || mode === "FULL_PTT") && (
          <p>User talking: {isUserTalking ? "true" : "false"}</p>
        )}
        <p>Avatar talking: {isAvatarTalking ? "true" : "false"}</p>
        {mode === "FULL" && VoiceChatComponents}
        {mode === "FULL_PTT" && PushToTalkComponents}
        <Button
          onClick={() => {
            keepAlive();
          }}
        >
          Keep Alive
        </Button>
        <div className="w-full h-full flex flex-row items-center justify-center gap-4">
          <Button
            onClick={() => {
              interrupt();
            }}
          >
            Interrupt
          </Button>
        </div>
        <div className="w-full h-full flex flex-row items-center justify-center gap-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-[400px] bg-white text-black px-4 py-2 rounded-md"
          />
          <Button
            onClick={() => {
              sendMessage(message);
              setMessage("");
            }}
          >
            Send
          </Button>
          <Button
            onClick={() => {
              repeat(message);
              setMessage("");
            }}
          >
            Repeat
          </Button>
        </div>
      </div>
    </div>
  );
};

export const LiveAvatarSession: React.FC<{
  apiUrl: string;
  mode: SessionMode;
  sessionAccessToken: string;
  onSessionStopped: () => void;
  voiceChatConfig?: boolean | VoiceChatConfig;
  iaraWsUrl?: string;
  iaraApiUrl?: string;
  iaraSystemPrompt?: string;
  iaraPresetId?: string;
}> = ({
  apiUrl,
  mode,
  sessionAccessToken,
  onSessionStopped,
  voiceChatConfig = true,
  iaraWsUrl,
  iaraApiUrl,
  iaraSystemPrompt,
  iaraPresetId,
}) => {
  return (
    <LiveAvatarContextProvider
      apiUrl={apiUrl}
      sessionAccessToken={sessionAccessToken}
      voiceChatConfig={voiceChatConfig}
    >
      <LiveAvatarSessionComponent
        mode={mode}
        onSessionStopped={onSessionStopped}
        iaraWsUrl={iaraWsUrl}
        iaraApiUrl={iaraApiUrl}
        iaraSystemPrompt={iaraSystemPrompt}
        iaraPresetId={iaraPresetId}
      />
    </LiveAvatarContextProvider>
  );
};
