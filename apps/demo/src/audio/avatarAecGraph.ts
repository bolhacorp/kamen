/**
 * Optional browser-side avatar AEC.
 * Keeps the current pipeline untouched when the feature toggle is off.
 */

const NLMS_WORKLET_SOURCE = `
class NLMSAecProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const filterLength = Math.max(512, Math.min(2048, Math.round(sampleRate * 0.032)));
    const referenceDelay = Math.max(64, Math.min(1024, Math.round(sampleRate * 0.012)));
    this.filterLength = filterLength;
    this.referenceDelay = referenceDelay;
    this.referenceHistory = new Float32Array(filterLength + referenceDelay + 1);
    this.weights = new Float32Array(filterLength);
    this.historyPos = 0;
    this.eps = 1e-6;
    this.mu = 0.12;
    this.leak = 0.99998;
    this.referenceFloor = 1e-5;
  }

  softClip(sample) {
    return Math.tanh(sample * 1.4) / 1.4;
  }

  process(inputs, outputs) {
    const mic = inputs[0]?.[0];
    const ref = inputs[1]?.[0];
    const out = outputs[0]?.[0];
    if (!mic || !out) return true;
    if (!ref || ref.length !== mic.length) {
      for (let i = 0; i < mic.length; i++) {
        out[i] = mic[i];
      }
      return true;
    }

    const L = this.filterLength;
    const history = this.referenceHistory;
    const weights = this.weights;
    const historyLen = history.length;

    for (let i = 0; i < mic.length; i++) {
      const d = mic[i] ?? 0;
      const r = ref[i] ?? 0;

      this.historyPos = (this.historyPos + 1) % historyLen;
      history[this.historyPos] = r;

      let yhat = 0;
      let refPower = this.eps;
      const delayedStart =
        (this.historyPos - this.referenceDelay + historyLen) % historyLen;
      for (let k = 0; k < L; k++) {
        const idx = (delayedStart - k + historyLen) % historyLen;
        const x = history[idx];
        yhat += weights[k] * x;
        refPower += x * x;
      }

      const error = d - yhat;
      const micPower = d * d;
      const doubleTalk = micPower > refPower * 0.18;
      const hasReference = refPower > this.referenceFloor;

      if (hasReference) {
        for (let k = 0; k < L; k++) {
          weights[k] *= this.leak;
        }
      }

      if (hasReference && !doubleTalk) {
        const step = (this.mu * error) / refPower;
        for (let k = 0; k < L; k++) {
          const idx = (delayedStart - k + historyLen) % historyLen;
          weights[k] += step * history[idx];
        }
      }

      out[i] = hasReference ? this.softClip(error) : d;
    }

    return true;
  }
}

registerProcessor("nlms-avatar-aec", NLMSAecProcessor);
`;

let workletBlobUrl: string | null = null;

function getNlmsWorkletUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("Avatar AEC is browser-only");
  }
  if (!workletBlobUrl) {
    workletBlobUrl = URL.createObjectURL(
      new Blob([NLMS_WORKLET_SOURCE], { type: "application/javascript" }),
    );
  }
  return workletBlobUrl;
}

export type AvatarAecMicGraph = {
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  dispose: () => void;
};

/**
 * Builds mic → NLMS AEC → ScriptProcessor chain; routes avatar audio to speakers via the same graph.
 * Returns null if the graph cannot be created (caller should use legacy mic path).
 */
export async function createAvatarAecMicCaptureGraph(
  micStream: MediaStream,
  videoEl: HTMLVideoElement,
  bufferSize = 4096,
): Promise<AvatarAecMicGraph | null> {
  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContext();
    await audioContext.audioWorklet.addModule(getNlmsWorkletUrl());

    const micSrc = audioContext.createMediaStreamSource(micStream);
    const elemSrc = audioContext.createMediaElementSource(videoEl);

    const aecNode = new AudioWorkletNode(audioContext, "nlms-avatar-aec", {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });

    micSrc.connect(aecNode, 0, 0);
    elemSrc.connect(aecNode, 0, 1);

    const playbackGain = audioContext.createGain();
    playbackGain.gain.value = 1;
    elemSrc.connect(playbackGain);
    playbackGain.connect(audioContext.destination);

    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    aecNode.connect(processor);

    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    await audioContext.resume().catch(() => {});

    const dispose = () => {
      try {
        micSrc.disconnect();
      } catch {
        // ignore
      }
      try {
        elemSrc.disconnect();
      } catch {
        // ignore
      }
      try {
        aecNode.disconnect();
      } catch {
        // ignore
      }
      try {
        playbackGain.disconnect();
      } catch {
        // ignore
      }
      try {
        processor.disconnect();
      } catch {
        // ignore
      }
      try {
        silentGain.disconnect();
      } catch {
        // ignore
      }
    };

    return { audioContext, processor, dispose };
  } catch {
    if (audioContext) {
      void audioContext.close().catch(() => {});
    }
    return null;
  }
}
