import { Emitter } from "../emitter";
import type { AudioSource, MicResult } from "./AudioSource";

/**
 * No real microphone. FakeTransport drives `simulateVoice()` from its script so
 * the session sees speech start/stop exactly as the real VAD would report it.
 */
export class FakeAudio implements AudioSource {
  private running = false;
  private frames = new Emitter<ArrayBuffer>();
  private voice = new Emitter<"start" | "stop">();
  private readonly result: MicResult;

  constructor(result: MicResult = "granted") {
    this.result = result;
  }

  async start(): Promise<MicResult> {
    this.running = this.result === "granted";
    return this.result;
  }

  async resume(): Promise<boolean> {
    this.running = true;
    return true;
  }

  stop(): void {
    this.running = false;
  }

  simulateVoice(event: "start" | "stop"): void {
    if (this.running) this.voice.emit(event);
  }

  onFrame(cb: (pcm: ArrayBuffer) => void) {
    return this.frames.on(cb);
  }

  onVoice(cb: (event: "start" | "stop") => void) {
    return this.voice.on(cb);
  }
}
