/** Client-side shape for iara mic/VAD/streaming (from POST /api/session/start). */

export type IaraVadEngine = "rms" | "silero";
export type SileroVadModelId = "v5" | "legacy";

export type IaraAudioSettings = {
  engine: IaraVadEngine;
  sileroModel: SileroVadModelId;
  rmsThreshold: number;
  hangoverMs: number;
  listeningHoldMs: number;
  minSpeechMs: number;
  sileroPositiveThreshold: number;
  sileroNegativeThreshold: number;
  sileroRedemptionMs: number;
  sileroPreSpeechPadMs: number;
  voiceApiMinBufferMs: number;
  wsMinAppendMs: number;
};

/** Defaults match apps/demo/app/api/audioVadConfig.ts and legacy hardcoded hooks. */
export const DEFAULT_IARA_AUDIO_SETTINGS: IaraAudioSettings = {
  engine: "rms",
  sileroModel: "v5",
  rmsThreshold: 0.015,
  hangoverMs: 450,
  listeningHoldMs: 450,
  minSpeechMs: 600,
  sileroPositiveThreshold: 0.3,
  sileroNegativeThreshold: 0.25,
  sileroRedemptionMs: 1400,
  sileroPreSpeechPadMs: 800,
  voiceApiMinBufferMs: 700,
  wsMinAppendMs: 100,
};

export function mergeIaraAudio(
  partial?: IaraAudioSettings | null,
): IaraAudioSettings {
  if (!partial) return { ...DEFAULT_IARA_AUDIO_SETTINGS };
  return { ...DEFAULT_IARA_AUDIO_SETTINGS, ...partial };
}
