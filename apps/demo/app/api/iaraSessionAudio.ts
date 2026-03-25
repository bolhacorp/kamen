import type { Config } from "./secrets";
import type { IaraAudioSettings } from "../../src/liveavatar/iaraAudioSettings";

/** Snapshot of iara mic/VAD/streaming for the client (LITE_IARA). */
export function buildIaraAudioForClient(config: Config): IaraAudioSettings {
  return {
    engine: config.IARA_VAD_ENGINE,
    sileroModel: config.SILERO_VAD_MODEL,
    rmsThreshold: config.IARA_VAD_RMS_THRESHOLD,
    hangoverMs: config.IARA_VAD_HANGOVER_MS,
    listeningHoldMs: config.IARA_VAD_LISTENING_HOLD_MS,
    minSpeechMs: config.IARA_VAD_MIN_SPEECH_MS,
    sileroPositiveThreshold: config.SILERO_VAD_POSITIVE_SPEECH_THRESHOLD,
    sileroNegativeThreshold: config.SILERO_VAD_NEGATIVE_SPEECH_THRESHOLD,
    sileroRedemptionMs: config.SILERO_VAD_REDEMPTION_MS,
    sileroPreSpeechPadMs: config.SILERO_VAD_PRE_SPEECH_PAD_MS,
    voiceApiMinBufferMs: config.IARA_VOICE_API_MIN_BUFFER_MS,
    wsMinAppendMs: config.IARA_WS_MIN_APPEND_MS,
  };
}
