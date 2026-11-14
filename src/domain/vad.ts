// Tiny energy-based voice-activity detector. Pure: feed it frame levels, it
// says when speech starts and stops. The END_OF_SPEECH_MS countdown runs on
// top of `stop`, so the hang-over here is kept short.

export interface VadOptions {
  /** RMS (0..1) above which a frame counts as voiced. */
  threshold: number;
  /** Voiced time needed before reporting speech start. */
  onsetMs: number;
  /** Unvoiced time needed before reporting speech stop. */
  hangoverMs: number;
}

export const DEFAULT_VAD: VadOptions = { threshold: 0.02, onsetMs: 200, hangoverMs: 300 };

export interface VadState {
  speaking: boolean;
  voicedMs: number;
  silentMs: number;
}

export const initialVad: VadState = { speaking: false, voicedMs: 0, silentMs: 0 };

export function stepVad(
  prev: VadState,
  rms: number,
  frameMs: number,
  opts: VadOptions = DEFAULT_VAD,
): { state: VadState; event: "start" | "stop" | null } {
  const voiced = rms >= opts.threshold;
  const voicedMs = voiced ? prev.voicedMs + frameMs : 0;
  const silentMs = voiced ? 0 : prev.silentMs + frameMs;
  if (!prev.speaking && voicedMs >= opts.onsetMs) {
    return { state: { speaking: true, voicedMs, silentMs }, event: "start" };
  }
  if (prev.speaking && silentMs >= opts.hangoverMs) {
    return { state: { speaking: false, voicedMs, silentMs }, event: "stop" };
  }
  return { state: { speaking: prev.speaking, voicedMs, silentMs }, event: null };
}
