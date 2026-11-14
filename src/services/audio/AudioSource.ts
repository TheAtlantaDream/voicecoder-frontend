import type { MicStatus } from "../../domain/session";

export type Unsubscribe = () => void;

/** What starting the mic resulted in. "suspended" = autoplay policy is blocking audio. */
export type MicResult = Exclude<MicStatus, "requesting">;

export interface AudioSource {
  /** Requests the mic and starts producing frames. Never throws; errors map to a MicResult. */
  start(): Promise<MicResult>;
  /** Resumes a suspended AudioContext (call from a user gesture). Resolves true if now running. */
  resume(): Promise<boolean>;
  /** Stops all tracks and closes the context. Safe to call at any time, including mid-start. */
  stop(): void;
  /** 16 kHz mono PCM16 frames, ~100 ms each. */
  onFrame(cb: (pcm: ArrayBuffer) => void): Unsubscribe;
  /** Voice activity edges from the VAD. */
  onVoice(cb: (event: "start" | "stop") => void): Unsubscribe;
}
