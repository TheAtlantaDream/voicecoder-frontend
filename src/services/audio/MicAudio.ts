import { initialVad, stepVad, type VadState } from "../../domain/vad";
import { Emitter } from "../emitter";
import type { AudioSource, MicResult } from "./AudioSource";

const SAMPLE_RATE = 16_000;
const FRAME_MS = 100;

/** Maps getUserMedia / AudioContext errors to a MicResult. */
export function mapMediaError(err: unknown): MicResult {
  const name = err instanceof Error || err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no_device";
    default:
      return "error";
  }
}

interface WorkletFrame {
  pcm: ArrayBuffer;
  rms: number;
}

export class MicAudio implements AudioSource {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  /** Bumped by stop(); a start() that finishes after a stop() tears itself down. */
  private generation = 0;
  private vad: VadState = initialVad;
  private frames = new Emitter<ArrayBuffer>();
  private voice = new Emitter<"start" | "stop">();
  private readonly workletUrl: string;

  constructor(workletUrl = `${import.meta.env.BASE_URL}pcm-worklet.js`) {
    this.workletUrl = workletUrl;
  }

  async start(): Promise<MicResult> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "insecure_context";
    this.stop();
    const gen = this.generation;
    const stale = () => gen !== this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      if (stale()) {
        stream.getTracks().forEach((t) => t.stop());
        return "granted";
      }
      this.stream = stream;

      const ctx = this.createContext(stream);
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(this.workletUrl);
      if (stale()) return "granted";

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-worklet", {
        processorOptions: { targetSampleRate: SAMPLE_RATE, frameMs: FRAME_MS },
      });
      node.port.onmessage = (e: MessageEvent<WorkletFrame>) => this.handleFrame(e.data);
      source.connect(node);
      this.node = node;

      // Autoplay policy: try to resume; if still suspended the caller asks for a key press.
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      return ctx.state === "running" ? "granted" : "suspended";
    } catch (err) {
      if (!stale()) this.stop();
      console.warn("[mic] start failed", err);
      return mapMediaError(err);
    }
  }

  async resume(): Promise<boolean> {
    if (!this.ctx) return false;
    await this.ctx.resume().catch(() => {});
    return this.ctx.state === "running";
  }

  stop(): void {
    this.generation++;
    this.vad = initialVad;
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  onFrame(cb: (pcm: ArrayBuffer) => void) {
    return this.frames.on(cb);
  }

  onVoice(cb: (event: "start" | "stop") => void) {
    return this.voice.on(cb);
  }

  private createContext(stream: MediaStream): AudioContext {
    // Ask for 16 kHz directly. Firefox refuses to connect a mic stream to a
    // context at a different rate; fall back to the native rate and let the
    // worklet resample.
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    try {
      ctx.createMediaStreamSource(stream).disconnect();
      return ctx;
    } catch {
      void ctx.close();
      return new AudioContext();
    }
  }

  private handleFrame({ pcm, rms }: WorkletFrame): void {
    this.frames.emit(pcm);
    const { state, event } = stepVad(this.vad, rms, FRAME_MS);
    this.vad = state;
    if (event) this.voice.emit(event);
  }
}
