/**
 * Clamp / normalize iara VAD, streaming, and OpenAI Realtime server VAD fields.
 * Used by getConfig() so API routes and saved config stay consistent.
 */

export type IaraVadEngine = "rms" | "silero";
export type SileroVadModelId = "v5" | "legacy";

export const AUDIO_VAD_DEFAULTS = {
  IARA_VAD_ENGINE: "rms" as IaraVadEngine,
  SILERO_VAD_MODEL: "v5" as SileroVadModelId,
  IARA_VAD_RMS_THRESHOLD: 0.015,
  IARA_VAD_HANGOVER_MS: 450,
  IARA_VAD_LISTENING_HOLD_MS: 450,
  IARA_VAD_MIN_SPEECH_MS: 600,
  SILERO_VAD_POSITIVE_SPEECH_THRESHOLD: 0.3,
  SILERO_VAD_NEGATIVE_SPEECH_THRESHOLD: 0.25,
  SILERO_VAD_REDEMPTION_MS: 1400,
  SILERO_VAD_PRE_SPEECH_PAD_MS: 800,
  IARA_VOICE_API_MIN_BUFFER_MS: 700,
  IARA_WS_MIN_APPEND_MS: 100,
  OPENAI_REALTIME_VAD_THRESHOLD: 0.5,
  OPENAI_REALTIME_VAD_PREFIX_PADDING_MS: 300,
  OPENAI_REALTIME_VAD_SILENCE_DURATION_MS: 500,
} as const;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeIaraVadEngine(value: unknown): IaraVadEngine {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "silero" ? "silero" : "rms";
}

export function normalizeSileroVadModel(value: unknown): SileroVadModelId {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "legacy" ? "legacy" : "v5";
}

/** Merge normalized audio/VAD fields into a config-shaped object. */
export function applyAudioVadNormalization(
  merged: Record<string, unknown>,
): Record<string, unknown> {
  const d = AUDIO_VAD_DEFAULTS;
  const pos = clamp(
    num(
      merged.SILERO_VAD_POSITIVE_SPEECH_THRESHOLD,
      d.SILERO_VAD_POSITIVE_SPEECH_THRESHOLD,
    ),
    0,
    1,
  );
  let neg = clamp(
    num(
      merged.SILERO_VAD_NEGATIVE_SPEECH_THRESHOLD,
      d.SILERO_VAD_NEGATIVE_SPEECH_THRESHOLD,
    ),
    0,
    1,
  );
  if (neg > pos) neg = pos;

  return {
    ...merged,
    IARA_VAD_ENGINE: normalizeIaraVadEngine(merged.IARA_VAD_ENGINE),
    SILERO_VAD_MODEL: normalizeSileroVadModel(merged.SILERO_VAD_MODEL),
    IARA_VAD_RMS_THRESHOLD: clamp(
      num(merged.IARA_VAD_RMS_THRESHOLD, d.IARA_VAD_RMS_THRESHOLD),
      0.0001,
      1,
    ),
    IARA_VAD_HANGOVER_MS: clamp(
      num(merged.IARA_VAD_HANGOVER_MS, d.IARA_VAD_HANGOVER_MS),
      0,
      10_000,
    ),
    IARA_VAD_LISTENING_HOLD_MS: clamp(
      num(merged.IARA_VAD_LISTENING_HOLD_MS, d.IARA_VAD_LISTENING_HOLD_MS),
      0,
      10_000,
    ),
    IARA_VAD_MIN_SPEECH_MS: clamp(
      num(merged.IARA_VAD_MIN_SPEECH_MS, d.IARA_VAD_MIN_SPEECH_MS),
      0,
      60_000,
    ),
    SILERO_VAD_POSITIVE_SPEECH_THRESHOLD: pos,
    SILERO_VAD_NEGATIVE_SPEECH_THRESHOLD: neg,
    SILERO_VAD_REDEMPTION_MS: clamp(
      num(merged.SILERO_VAD_REDEMPTION_MS, d.SILERO_VAD_REDEMPTION_MS),
      0,
      30_000,
    ),
    SILERO_VAD_PRE_SPEECH_PAD_MS: clamp(
      num(merged.SILERO_VAD_PRE_SPEECH_PAD_MS, d.SILERO_VAD_PRE_SPEECH_PAD_MS),
      0,
      10_000,
    ),
    IARA_VOICE_API_MIN_BUFFER_MS: clamp(
      num(merged.IARA_VOICE_API_MIN_BUFFER_MS, d.IARA_VOICE_API_MIN_BUFFER_MS),
      50,
      30_000,
    ),
    IARA_WS_MIN_APPEND_MS: clamp(
      num(merged.IARA_WS_MIN_APPEND_MS, d.IARA_WS_MIN_APPEND_MS),
      10,
      5000,
    ),
    OPENAI_REALTIME_VAD_THRESHOLD: clamp(
      num(
        merged.OPENAI_REALTIME_VAD_THRESHOLD,
        d.OPENAI_REALTIME_VAD_THRESHOLD,
      ),
      0,
      1,
    ),
    OPENAI_REALTIME_VAD_PREFIX_PADDING_MS: clamp(
      num(
        merged.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS,
        d.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS,
      ),
      0,
      10_000,
    ),
    OPENAI_REALTIME_VAD_SILENCE_DURATION_MS: clamp(
      num(
        merged.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS,
        d.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS,
      ),
      0,
      10_000,
    ),
  };
}
