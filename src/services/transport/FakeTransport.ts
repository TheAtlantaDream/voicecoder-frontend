import type { ClientMsg, ServerMsg } from "../../domain/protocol";
import { Emitter } from "../emitter";
import type { ScriptStep } from "./scripts";
import type { ConnectionStatusEvent, Transport } from "./Transport";

export const FAKE_CONNECT_MS = 300;

interface VoiceSink {
  simulateVoice(event: "start" | "stop"): void;
}

/**
 * Replays a script instead of talking to the bridge. Playback starts on
 * `mic.start` and replays on the next `mic.start` once finished.
 */
export class FakeTransport implements Transport {
  private open = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stepIndex = -1; // -1 = idle
  private waitingFor: string | null = null;
  private messages = new Emitter<ServerMsg>();
  private statuses = new Emitter<ConnectionStatusEvent>();
  /** Every message the client sent (handy in tests). */
  readonly sent: ClientMsg[] = [];
  private readonly script: ScriptStep[];
  private readonly audio: VoiceSink | null;

  constructor(script: ScriptStep[], audio: VoiceSink | null = null) {
    this.script = script;
    this.audio = audio;
  }

  connect(): void {
    this.statuses.emit({ status: "connecting", retryInMs: null });
    this.later(FAKE_CONNECT_MS, () => {
      this.open = true;
      this.statuses.emit({ status: "open", retryInMs: null });
    });
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.open = false;
    this.stepIndex = -1;
    this.waitingFor = null;
    this.statuses.emit({ status: "closed", retryInMs: null });
  }

  retryNow(): void {}

  send(msg: ClientMsg): void {
    if (!this.open) return;
    this.sent.push(msg);
    if (msg.type === "mic.start" && this.stepIndex === -1) {
      this.stepIndex = 0;
      this.next();
    } else if (msg.type === this.waitingFor) {
      this.waitingFor = null;
      this.next();
    }
  }

  sendAudio(): void {}

  onMessage(cb: (msg: ServerMsg) => void) {
    return this.messages.on(cb);
  }

  onStatus(cb: (status: ConnectionStatusEvent) => void) {
    return this.statuses.on(cb);
  }

  private next(): void {
    const step = this.script[this.stepIndex];
    if (!step) {
      this.stepIndex = -1;
      return;
    }
    if ("waitFor" in step) {
      this.waitingFor = step.waitFor;
      this.stepIndex++;
      return;
    }
    this.later(step.after, () => {
      if ("voice" in step) this.audio?.simulateVoice(step.voice);
      else this.messages.emit(step.msg);
      this.stepIndex++;
      this.next();
    });
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
}
