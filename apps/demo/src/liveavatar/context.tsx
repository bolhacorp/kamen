import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ConnectionQuality,
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
  AgentEventsEnum,
  VoiceChatConfig,
} from "@heygen/liveavatar-web-sdk";
import { logLiveAvatar } from "../pipeline-log";
import { LiveAvatarSessionMessage } from "./types";

type LiveAvatarContextProps = {
  sessionRef: React.RefObject<LiveAvatarSession>;

  isMuted: boolean;
  voiceChatState: VoiceChatState;

  sessionState: SessionState;
  isStreamReady: boolean;
  connectionQuality: ConnectionQuality;

  isUserTalking: boolean;
  isAvatarTalking: boolean;

  messages: LiveAvatarSessionMessage[];
};

export const LiveAvatarContext = createContext<LiveAvatarContextProps>({
  sessionRef: {
    current: null,
  } as unknown as React.RefObject<LiveAvatarSession>,
  connectionQuality: ConnectionQuality.UNKNOWN,
  isMuted: true,
  voiceChatState: VoiceChatState.INACTIVE,
  sessionState: SessionState.DISCONNECTED,
  isStreamReady: false,
  isUserTalking: false,
  isAvatarTalking: false,
  messages: [],
});

const DEFAULT_API_URL = "https://api.liveavatar.com";

type LiveAvatarContextProviderProps = {
  children: React.ReactNode;
  sessionAccessToken: string;
  apiUrl?: string;
  voiceChatConfig?: boolean | VoiceChatConfig;
};

const useSessionState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [sessionState, setSessionState] = useState<SessionState>(
    sessionRef.current?.state || SessionState.INACTIVE,
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    sessionRef.current?.connectionQuality || ConnectionQuality.UNKNOWN,
  );
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);

  useEffect(() => {
    if (sessionRef.current) {
      const session = sessionRef.current;
      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        logLiveAvatar("Session state changed", "info", { state });
        setSessionState(state);
        if (state === SessionState.DISCONNECTED) {
          session.removeAllListeners();
          session.voiceChat.removeAllListeners();
          setIsStreamReady(false);
        }
      });
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        logLiveAvatar("Session stream ready (video track available)", "info");
        setIsStreamReady(true);
      });
      session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, (quality) => {
        logLiveAvatar("Connection quality changed", "debug", { quality });
        setConnectionQuality(quality);
      });
      session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
        logLiveAvatar("Session disconnected", "info", { reason });
      });
      session.on(AgentEventsEnum.USER_SPEAK_STARTED, (e) => {
        logLiveAvatar("LiveAvatar event: user.speak_started", "info", {
          event_id: e.event_id,
        });
      });
      session.on(AgentEventsEnum.USER_SPEAK_ENDED, (e) => {
        logLiveAvatar("LiveAvatar event: user.speak_ended", "info", {
          event_id: e.event_id,
        });
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, (e) => {
        logLiveAvatar("LiveAvatar event: avatar.speak_started", "info", {
          event_id: e.event_id,
        });
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, (e) => {
        logLiveAvatar("LiveAvatar event: avatar.speak_ended", "info", {
          event_id: e.event_id,
        });
      });
      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
        logLiveAvatar("LiveAvatar event: user.transcription", "info", {
          text: (e as { text?: string }).text?.slice(0, 80),
        });
      });
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => {
        logLiveAvatar("LiveAvatar event: avatar.transcription", "info", {
          text: (e as { text?: string }).text?.slice(0, 80),
        });
      });
    }
  }, [sessionRef]);

  return { sessionState, isStreamReady, connectionQuality };
};

const useVoiceChatState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isMuted, setIsMuted] = useState(true);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(
    sessionRef.current?.voiceChat.state || VoiceChatState.INACTIVE,
  );

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.voiceChat.on(VoiceChatEvent.MUTED, () => {
        setIsMuted(true);
      });
      sessionRef.current.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
        setIsMuted(false);
      });
      sessionRef.current.voiceChat.on(
        VoiceChatEvent.STATE_CHANGED,
        setVoiceChatState,
      );
    }
  }, [sessionRef]);

  return { isMuted, voiceChatState };
};

const useTalkingState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
        setIsUserTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
        setIsUserTalking(false);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        setIsAvatarTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        setIsAvatarTalking(false);
      });
    }
  }, [sessionRef]);

  return { isUserTalking, isAvatarTalking };
};

export const LiveAvatarContextProvider = ({
  children,
  sessionAccessToken,
  apiUrl = DEFAULT_API_URL,
  voiceChatConfig = true,
}: LiveAvatarContextProviderProps) => {
  const config = {
    voiceChat: voiceChatConfig,
    apiUrl,
  };
  const sessionRef = useRef<LiveAvatarSession>(
    new LiveAvatarSession(sessionAccessToken, config),
  );

  const { sessionState, isStreamReady, connectionQuality } =
    useSessionState(sessionRef);

  const { isMuted, voiceChatState } = useVoiceChatState(sessionRef);
  const { isUserTalking, isAvatarTalking } = useTalkingState(sessionRef);
  // const { messages } = useChatHistoryState(sessionRef);

  return (
    <LiveAvatarContext.Provider
      value={{
        sessionRef,
        sessionState,
        isStreamReady,
        connectionQuality,
        isMuted,
        voiceChatState,
        isUserTalking,
        isAvatarTalking,
        messages: [], // TODO - properly implement chat history
      }}
    >
      {children}
    </LiveAvatarContext.Provider>
  );
};

export const useLiveAvatarContext = () => {
  return useContext(LiveAvatarContext);
};
