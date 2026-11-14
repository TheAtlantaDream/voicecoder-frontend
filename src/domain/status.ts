import type { MicStatus, Stage, State } from "./session";

const MIC_TEXT: Record<Exclude<MicStatus, "granted">, string> = {
  requesting: "Starting the microphone…",
  suspended: "Press any key to start listening",
  denied: "Microphone blocked: allow it in the browser's site settings, then reload",
  no_device: "No microphone found: connect one, then reload",
  insecure_context: "The microphone needs HTTPS: open VoiceCoder through the Coder app link",
  error: "The microphone could not be started: reload to try again",
};

const STAGE_TEXT: Record<Stage, string> = {
  listening: "Listening",
  hearing: "Hearing you…",
  pausing: "Pause detected, sending soon",
  cleaning: "Cleaning up your request…",
  thinking: "Agent is thinking…",
  responding: "Agent is responding…",
  paused: "Mic off: not listening",
};

/** One line describing what VoiceCoder is doing right now (visible status text). */
export function describeStatus(state: State): string {
  if (state.stage === "paused") return STAGE_TEXT.paused;
  if (state.mic !== "granted") return MIC_TEXT[state.mic];
  if (state.connection.status === "connecting") return "Connecting…";
  if (state.connection.status === "closed") return "Offline: not sending audio";
  return STAGE_TEXT[state.stage];
}
