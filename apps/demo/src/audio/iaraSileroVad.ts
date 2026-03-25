"use client";

import type { FrameProcessorOptions } from "@ricky0123/vad-web";
import { validateOptions } from "@ricky0123/vad-web/dist/frame-processor";
import type { SileroVadModelId } from "../liveavatar/iaraAudioSettings";

/** Pin to installed packages for CDN asset URLs. */
const VAD_WEB_PKG = "0.0.29";
const ONNX_RUNTIME_PKG = "1.24.3";

export const VAD_WEB_CDN_BASE = `https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@${VAD_WEB_PKG}/dist/`;
export const ONNX_WASM_CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_PKG}/dist/`;

const IARA_SAMPLE_RATE = 24_000;
const SILERO_SAMPLE_RATE = 16_000;

function resampleTo16kMonoFrom24k(input: Float32Array): Float32Array {
  if (input.length === 0) return new Float32Array();
  const outLen = Math.max(
    1,
    Math.floor((input.length * SILERO_SAMPLE_RATE) / IARA_SAMPLE_RATE),
  );
  const out = new Float32Array(outLen);
  const scale = IARA_SAMPLE_RATE / SILERO_SAMPLE_RATE;
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

export type IaraSileroVadHandle = {
  /** Feed 24 kHz mono floats from the same path as iara hooks. */
  feedSamples24k: (samples24k: Float32Array) => Promise<void>;
  /** Current speech state after last processed frames. */
  isSpeaking: () => boolean;
  reset: () => void;
  dispose: () => Promise<void>;
};

/**
 * Silero VAD running on iara's 24 kHz pipeline (resampled to 16 kHz internally).
 * Falls back should be handled by the caller if `createIaraSileroVad` throws.
 */
export async function createIaraSileroVad(options: {
  model: SileroVadModelId;
  frameOptions: FrameProcessorOptions;
  baseAssetPath?: string;
  onnxWASMBasePath?: string;
}): Promise<IaraSileroVadHandle> {
  if (typeof window === "undefined") {
    throw new Error("createIaraSileroVad is browser-only");
  }

  const baseAssetPath = options.baseAssetPath ?? VAD_WEB_CDN_BASE;
  const onnxWASMBasePath = options.onnxWASMBasePath ?? ONNX_WASM_CDN_BASE;

  const [{ FrameProcessor, defaultModelFetcher }, models, ort] =
    await Promise.all([
      import("@ricky0123/vad-web"),
      import("@ricky0123/vad-web/dist/models"),
      import("onnxruntime-web/wasm"),
    ]);

  validateOptions(options.frameOptions);

  ort.env.wasm.wasmPaths = onnxWASMBasePath;
  ort.env.logLevel = "error";

  const modelFile =
    options.model === "v5" ? "silero_vad_v5.onnx" : "silero_vad_legacy.onnx";
  const modelURL = baseAssetPath + modelFile;
  const modelFactory =
    options.model === "v5" ? models.SileroV5.new : models.SileroLegacy.new;

  const silero = await modelFactory(ort, () => defaultModelFetcher(modelURL));

  const frameSamples = options.model === "v5" ? 512 : 1536;
  const msPerFrame = frameSamples / 16;

  const frameProcessor = new FrameProcessor(
    (frame) => silero.process(frame),
    () => silero.reset_state(),
    {
      positiveSpeechThreshold: options.frameOptions.positiveSpeechThreshold,
      negativeSpeechThreshold: options.frameOptions.negativeSpeechThreshold,
      redemptionMs: options.frameOptions.redemptionMs,
      preSpeechPadMs: options.frameOptions.preSpeechPadMs,
      minSpeechMs: options.frameOptions.minSpeechMs,
      submitUserSpeechOnPause: false,
    },
    msPerFrame,
  );

  frameProcessor.resume();

  let accumulator = new Float32Array(0);

  const appendAccumulator = (chunk: Float32Array) => {
    if (chunk.length === 0) return;
    const next = new Float32Array(accumulator.length + chunk.length);
    next.set(accumulator);
    next.set(chunk, accumulator.length);
    accumulator = next;
  };

  const noopFrameHandler = () => {};

  const processOneFrame = async () => {
    if (accumulator.length < frameSamples) return;
    const frame = accumulator.slice(0, frameSamples);
    accumulator = accumulator.slice(frameSamples);
    await frameProcessor.process(frame, noopFrameHandler);
  };

  const drainFrames = async () => {
    while (accumulator.length >= frameSamples) {
      await processOneFrame();
    }
  };

  return {
    feedSamples24k: async (samples24k: Float32Array) => {
      const s16 = resampleTo16kMonoFrom24k(samples24k);
      appendAccumulator(s16);
      await drainFrames();
    },

    isSpeaking: () => frameProcessor.speaking,

    reset: () => {
      frameProcessor.reset();
      accumulator = new Float32Array(0);
    },

    dispose: async () => {
      accumulator = new Float32Array(0);
      frameProcessor.pause(noopFrameHandler);
    },
  };
}
