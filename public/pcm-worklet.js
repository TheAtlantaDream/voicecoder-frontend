// AudioWorklet: Float32 mic input -> 16 kHz mono PCM16 frames (~100 ms).
// Posts { pcm: ArrayBuffer, rms: number } per frame; pcm is transferred.
class PcmWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetSampleRate || 16000;
    this.frameSize = Math.round((this.targetRate * (opts.frameMs || 100)) / 1000);
    // `sampleRate` is the context rate, a global in AudioWorkletGlobalScope.
    this.step = sampleRate / this.targetRate;
    this.pos = 0; // fractional read position into the current input block
    this.frame = new Int16Array(this.frameSize);
    this.filled = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    // Nearest-sample resampling; identity when the context already runs at 16 kHz.
    while (this.pos < channel.length) {
      const s = Math.max(-1, Math.min(1, channel[Math.floor(this.pos)]));
      this.frame[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.sumSquares += s * s;
      this.pos += this.step;
      if (this.filled === this.frameSize) this.flush();
    }
    this.pos -= channel.length;
    return true;
  }

  flush() {
    const rms = Math.sqrt(this.sumSquares / this.frameSize);
    const pcm = this.frame.buffer;
    this.port.postMessage({ pcm, rms }, [pcm]);
    this.frame = new Int16Array(this.frameSize);
    this.filled = 0;
    this.sumSquares = 0;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
