// AudioWorklet that turns microphone input into 16 kHz PCM16 frames for
// speech-to-text, plus a loudness (RMS) value per frame for barge-in detection.
// Kept as a string so it can be loaded from a Blob URL without a separate file.

export const MIC_SAMPLE_RATE = 16_000;
export const MIC_FRAME_SAMPLES = 640; // 40 ms
// Audio is held while a speech-to-text connection opens, up to this many
// frames (about five seconds), then the oldest are dropped.
export const MAX_QUEUED_FRAMES = 125;

const source = /* js */ `
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${MIC_SAMPLE_RATE};
    this.position = 0;
    this.pending = [];
    this.frame = new Int16Array(${MIC_FRAME_SAMPLES});
    this.length = 0;
    this.energy = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) this.pending.push(channel[i]);

    // Downsample by averaging each output sample's window of input samples.
    while (this.position + this.ratio <= this.pending.length) {
      const start = Math.floor(this.position);
      const end = Math.max(start + 1, Math.floor(this.position + this.ratio));
      let sum = 0;
      for (let i = start; i < end; i++) sum += this.pending[i];
      const sample = Math.max(-1, Math.min(1, sum / (end - start)));
      this.position += this.ratio;

      this.frame[this.length++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.energy += sample * sample;
      if (this.length === ${MIC_FRAME_SAMPLES}) {
        const rms = Math.sqrt(this.energy / ${MIC_FRAME_SAMPLES});
        this.port.postMessage({ pcm: this.frame.buffer, rms }, [this.frame.buffer]);
        this.frame = new Int16Array(${MIC_FRAME_SAMPLES});
        this.length = 0;
        this.energy = 0;
      }
    }

    const consumed = Math.floor(this.position);
    if (consumed > 0) {
      this.pending = this.pending.slice(consumed);
      this.position -= consumed;
    }
    return true;
  }
}
registerProcessor("mic-processor", MicProcessor);
`;

let moduleUrl: string | null = null;

export function micWorkletUrl() {
  moduleUrl ??= URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  return moduleUrl;
}
