// Session state machine. Pure: no side effects, no clocks. Time comes in on actions.
import type { ServerMsg } from "./protocol";

export type Stage =
  | "listening"
  | "hearing"
  | "pausing"
  | "cleaning"
  | "thinking"
  | "responding"
  | "paused";

/** Device-level microphone status, separate from the conversation `stage`. */
export type MicStatus =
  | "requesting"
  | "granted"
  | "suspended" // granted, but the AudioContext is blocked by the autoplay policy
  | "denied"
  | "no_device"
  | "insecure_context"
  | "error";

export type ConnectionStatus = "connecting" | "open" | "closed";

export type RunStatus = "thinking" | "responding" | "done" | "failed";

export interface AgentRun {
  runId: string;
  /** transcript id of the request that started this run (stable React key). */
  requestId: string;
  cleaned: string;
  text: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
}

/** One request spoken while the agent was busy. */
export interface Queued {
  phase: "hearing" | "pausing" | "ready";
  pauseStartedAt: number | null;
  text: string;
}

export interface State {
  stage: Stage;
  /** Set while the user's speech is in the "pausing" countdown. */
  pauseStartedAt: number | null;
  mic: MicStatus;
  connection: { status: ConnectionStatus; retryInMs: number | null };
  /** Cleaned request received, waiting for agent.start. */
  sent: { id: string; raw: string; cleaned: string; at: number } | null;
  runs: AgentRun[];
  queued: Queued | null;
  /** Incremented whenever an `utterance.end` must be sent to the bridge. */
  utteranceSeq: number;
  error: { code: string; message: string; recoverable: boolean } | null;
  /** Text for the polite status announcer; the id changes on every announcement. */
  announcement: { id: number; text: string } | null;
}

export type Action =
  | { type: "mic.toggled"; on: boolean }
  | { type: "mic.status"; status: MicStatus }
  | { type: "connection"; status: ConnectionStatus; retryInMs: number | null; at: number }
  | { type: "speech.start"; at: number }
  | { type: "speech.stop"; at: number }
  /** `startedAt` is the pause this countdown belongs to; `text` is the partial transcript so far. */
  | { type: "countdown.ended"; at: number; startedAt: number; text: string }
  | { type: "server"; msg: ServerMsg; at: number };

export const initialState: State = {
  stage: "listening",
  pauseStartedAt: null,
  mic: "requesting",
  connection: { status: "connecting", retryInMs: null },
  sent: null,
  runs: [],
  queued: null,
  utteranceSeq: 0,
  error: null,
  announcement: null,
};

// ---------- selectors ----------

/** While busy, new speech is queued instead of sent. */
export function isAgentBusy(state: State): boolean {
  return state.stage === "cleaning" || state.stage === "thinking" || state.stage === "responding";
}

export function activeRun(state: State): AgentRun | undefined {
  return state.runs.find((r) => r.status === "thinking" || r.status === "responding");
}

/** The user's current speech (normal or queued), for LiveTranscript and PauseCountdown. */
export function speechPhase(
  state: State,
): { phase: "hearing" | "pausing"; pauseStartedAt: number | null } | null {
  if (state.stage === "hearing" || state.stage === "pausing") {
    return { phase: state.stage, pauseStartedAt: state.pauseStartedAt };
  }
  const q = state.queued;
  if (q && (q.phase === "hearing" || q.phase === "pausing")) {
    return { phase: q.phase, pauseStartedAt: q.pauseStartedAt };
  }
  return null;
}

// ---------- reducer ----------

function announce(state: State, text: string): State["announcement"] {
  return { id: (state.announcement?.id ?? 0) + 1, text };
}

const MIC_MESSAGES: Partial<Record<MicStatus, string>> = {
  suspended: "Press any key to start listening",
  denied: "Microphone access was denied. Allow the microphone in the browser's site settings, then reload.",
  no_device: "No microphone was found. Connect one, then reload.",
  insecure_context: "The microphone needs a secure (HTTPS) connection. Open VoiceCoder through the Coder app link.",
  error: "The microphone could not be started.",
};

function updateRun(state: State, runId: string, fn: (run: AgentRun) => AgentRun): AgentRun[] | null {
  const index = state.runs.findIndex((r) => r.runId === runId);
  if (index === -1) return null;
  return state.runs.map((r, i) => (i === index ? fn(r) : r));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "mic.toggled": {
      if (!action.on) {
        if (state.stage === "paused") return state;
        return {
          ...state,
          stage: "paused",
          pauseStartedAt: null,
          // A request the user already finished stays queued; a half-spoken one is dropped.
          queued: state.queued?.phase === "ready" ? state.queued : null,
          announcement: announce(state, "Microphone off"),
        };
      }
      if (state.stage !== "paused") return state;
      const run = activeRun(state);
      const stage: Stage = run ? run.status === "responding" ? "responding" : "thinking" : state.sent ? "thinking" : "listening";
      return {
        ...state,
        stage,
        announcement: announce(state, stage === "listening" ? "Microphone on, listening" : "Microphone on"),
      };
    }

    case "mic.status": {
      if (action.status === state.mic) return state;
      const message =
        action.status === "granted"
          ? state.mic === "suspended" ? "Listening" : null
          : MIC_MESSAGES[action.status] ?? null;
      return {
        ...state,
        mic: action.status,
        announcement: message ? announce(state, message) : state.announcement,
      };
    }

    case "connection": {
      const prev = state.connection.status;
      const connection = { status: action.status, retryInMs: action.retryInMs };
      if (action.status === "closed") {
        const lost = prev !== "closed";
        return {
          ...state,
          connection,
          stage: state.stage === "paused" ? "paused" : "listening",
          pauseStartedAt: null,
          sent: null,
          queued: null,
          runs: state.runs.map((r) =>
            r.status === "thinking" || r.status === "responding" ? { ...r, status: "failed", endedAt: action.at } : r,
          ),
          announcement: lost ? announce(state, "Connection lost. Reconnecting…") : state.announcement,
        };
      }
      return {
        ...state,
        connection,
        announcement:
          action.status === "open" && prev === "closed" ? announce(state, "Reconnected") : state.announcement,
      };
    }

    case "speech.start": {
      if (state.mic !== "granted" || state.connection.status !== "open") return state;
      if (state.stage === "listening" || state.stage === "pausing") {
        return { ...state, stage: "hearing", pauseStartedAt: null };
      }
      if (isAgentBusy(state)) {
        return { ...state, queued: { phase: "hearing", pauseStartedAt: null, text: state.queued?.text ?? "" } };
      }
      return state;
    }

    case "speech.stop": {
      if (state.stage === "hearing") {
        return { ...state, stage: "pausing", pauseStartedAt: action.at };
      }
      if (isAgentBusy(state) && state.queued?.phase === "hearing") {
        return { ...state, queued: { ...state.queued, phase: "pausing", pauseStartedAt: action.at } };
      }
      return state;
    }

    case "countdown.ended": {
      if (state.stage === "pausing" && state.pauseStartedAt === action.startedAt) {
        return { ...state, stage: "cleaning", pauseStartedAt: null, utteranceSeq: state.utteranceSeq + 1 };
      }
      const q = state.queued;
      if (q?.phase === "pausing" && q.pauseStartedAt === action.startedAt) {
        return {
          ...state,
          queued: { phase: "ready", pauseStartedAt: null, text: action.text },
          announcement: announce(state, "Queued until the agent finishes"),
        };
      }
      return state;
    }

    case "server":
      return serverReducer(state, action.msg, action.at);
  }
}

function serverReducer(state: State, msg: ServerMsg, at: number): State {
  switch (msg.type) {
    case "transcript.partial":
      return state; // kept in the partial-transcript store, not here

    case "transcript.final": {
      const sent = { id: msg.id, raw: msg.raw, cleaned: msg.cleaned, at };
      if (state.stage === "thinking" || state.stage === "responding") {
        // The bridge finalized the queued speech itself.
        return { ...state, sent, queued: null };
      }
      return {
        ...state,
        sent,
        stage: state.stage === "paused" ? "paused" : "thinking",
        pauseStartedAt: null,
      };
    }

    case "agent.start": {
      if (state.runs.some((r) => r.runId === msg.runId)) return state;
      const run: AgentRun = {
        runId: msg.runId,
        requestId: state.sent?.id ?? `run:${msg.runId}`,
        cleaned: state.sent?.cleaned ?? "",
        text: "",
        status: "thinking",
        startedAt: at,
      };
      const moveToThinking = state.stage === "cleaning" || state.stage === "listening";
      return {
        ...state,
        runs: [...state.runs, run],
        sent: null,
        stage: moveToThinking ? "thinking" : state.stage,
      };
    }

    case "agent.text": {
      const runs = updateRun(state, msg.runId, (r) => ({
        ...r,
        text: r.text + msg.delta,
        status: r.status === "thinking" ? "responding" : r.status,
      }));
      if (!runs) return state;
      return { ...state, runs, stage: state.stage === "thinking" ? "responding" : state.stage };
    }

    case "agent.done": {
      const runs = updateRun(state, msg.runId, (r) => ({
        ...r,
        status: msg.ok ? "done" : "failed",
        endedAt: at,
      }));
      if (!runs) return state;
      const announcement = announce(state, msg.ok ? "Agent finished" : "Agent failed");
      if (state.stage !== "thinking" && state.stage !== "responding") {
        return { ...state, runs, announcement };
      }
      const q = state.queued;
      if (q?.phase === "ready") {
        return { ...state, runs, announcement, queued: null, stage: "cleaning", utteranceSeq: state.utteranceSeq + 1 };
      }
      if (q) {
        return { ...state, runs, announcement, queued: null, stage: q.phase, pauseStartedAt: q.pauseStartedAt };
      }
      return { ...state, runs, announcement, stage: "listening" };
    }

    case "error":
      return {
        ...state,
        error: { code: msg.code, message: msg.message, recoverable: msg.recoverable },
        stage: state.stage === "cleaning" ? "listening" : state.stage,
        announcement: announce(state, msg.message),
      };
  }
}
