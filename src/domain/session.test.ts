import { describe, expect, it } from "vitest";
import { initialState, isAgentBusy, reducer, speechPhase, type Action, type State } from "./session";
import type { ServerMsg } from "./protocol";

// A live session: mic granted, socket open, nothing happening yet.
const live: State = {
  ...initialState,
  mic: "granted",
  connection: { status: "open", retryInMs: null },
};

const run = (state: State, ...actions: Action[]) => actions.reduce(reducer, state);
const server = (msg: ServerMsg, at = 0): Action => ({ type: "server", msg, at });

const hearing = run(live, { type: "speech.start", at: 100 });
const pausing = run(hearing, { type: "speech.stop", at: 200 });
const cleaning = run(pausing, { type: "countdown.ended", at: 1700, startedAt: 200, text: "add a validator" });
const thinkingNoRun = run(
  cleaning,
  server({ type: "transcript.final", id: "u1", raw: "um add a validator", cleaned: "Add a validator." }, 1800),
);
const thinking = run(thinkingNoRun, server({ type: "agent.start", runId: "r1" }, 1900));
const responding = run(thinking, server({ type: "agent.text", runId: "r1", delta: "Sure" }, 2000));

describe("initial state", () => {
  it("starts with the mic on (listening) while the mic is requested", () => {
    expect(initialState.stage).toBe("listening");
    expect(initialState.mic).toBe("requesting");
    expect(initialState.connection.status).toBe("connecting");
  });
});

describe("stage transitions", () => {
  it("listening -> hearing when speech is detected", () => {
    expect(hearing.stage).toBe("hearing");
  });

  it("hearing -> pausing when silence starts, recording when", () => {
    expect(pausing.stage).toBe("pausing");
    expect(pausing.pauseStartedAt).toBe(200);
  });

  it("pausing -> hearing when speech resumes before the countdown ends", () => {
    const s = run(pausing, { type: "speech.start", at: 900 });
    expect(s.stage).toBe("hearing");
    expect(s.pauseStartedAt).toBeNull();
  });

  it("pausing -> cleaning when the countdown ends, requesting utterance.end", () => {
    expect(cleaning.stage).toBe("cleaning");
    expect(cleaning.utteranceSeq).toBe(pausing.utteranceSeq + 1);
  });

  it("ignores a stale countdown from an earlier pause", () => {
    const resumedAndPausedAgain = run(
      pausing,
      { type: "speech.start", at: 900 },
      { type: "speech.stop", at: 1000 },
    );
    const s = run(resumedAndPausedAgain, { type: "countdown.ended", at: 1700, startedAt: 200, text: "" });
    expect(s.stage).toBe("pausing");
  });

  it("cleaning -> thinking when transcript.final arrives", () => {
    expect(thinkingNoRun.stage).toBe("thinking");
    expect(thinkingNoRun.sent).toEqual({ id: "u1", raw: "um add a validator", cleaned: "Add a validator.", at: 1800 });
  });

  it("agent.start creates a thinking run carrying the cleaned text", () => {
    expect(thinking.stage).toBe("thinking");
    expect(thinking.sent).toBeNull();
    expect(thinking.runs).toEqual([
      { runId: "r1", requestId: "u1", cleaned: "Add a validator.", text: "", status: "thinking", startedAt: 1900 },
    ]);
  });

  it("thinking -> responding on the first agent.text", () => {
    expect(responding.stage).toBe("responding");
    expect(responding.runs[0]?.status).toBe("responding");
    expect(responding.runs[0]?.text).toBe("Sure");
  });

  it("agent.text appends the delta", () => {
    const s = run(responding, server({ type: "agent.text", runId: "r1", delta: ", done." }));
    expect(s.runs[0]?.text).toBe("Sure, done.");
  });

  it("responding -> listening on agent.done, ending the run", () => {
    const s = run(responding, server({ type: "agent.done", runId: "r1", ok: true }, 3000));
    expect(s.stage).toBe("listening");
    expect(s.runs[0]).toMatchObject({ status: "done", endedAt: 3000 });
    expect(s.announcement?.text).toBe("Agent finished");
  });

  it("marks the run failed when agent.done is not ok", () => {
    const s = run(responding, server({ type: "agent.done", runId: "r1", ok: false }, 3000));
    expect(s.stage).toBe("listening");
    expect(s.runs[0]?.status).toBe("failed");
    expect(s.announcement?.text).toBe("Agent failed");
  });

  it.each([
    ["listening", live],
    ["hearing", hearing],
    ["pausing", pausing],
    ["cleaning", cleaning],
    ["thinking", thinking],
    ["responding", responding],
  ] as const)("%s -> paused when the user turns the mic off", (_name, from) => {
    const s = run(from, { type: "mic.toggled", on: false });
    expect(s.stage).toBe("paused");
    expect(s.pauseStartedAt).toBeNull();
    expect(s.announcement?.text).toBe("Microphone off");
  });

  it("paused -> listening when the user turns the mic on", () => {
    const s = run(live, { type: "mic.toggled", on: false }, { type: "mic.toggled", on: true });
    expect(s.stage).toBe("listening");
    expect(s.announcement?.text).toBe("Microphone on, listening");
  });

  it("paused -> back to the agent's stage when turned on while a run is still active", () => {
    const s = run(responding, { type: "mic.toggled", on: false }, { type: "mic.toggled", on: true });
    expect(s.stage).toBe("responding");
  });

  it("stays paused while the agent finishes in the background", () => {
    const s = run(
      responding,
      { type: "mic.toggled", on: false },
      server({ type: "agent.text", runId: "r1", delta: "!" }),
      server({ type: "agent.done", runId: "r1", ok: true }, 3000),
    );
    expect(s.stage).toBe("paused");
    expect(s.runs[0]).toMatchObject({ text: "Sure!", status: "done" });
  });

  it("a bridge-side transcript.final while hearing goes straight to thinking", () => {
    const s = run(hearing, server({ type: "transcript.final", id: "u9", raw: "x", cleaned: "X." }));
    expect(s.stage).toBe("thinking");
  });
});

describe("queueing speech while the agent works", () => {
  const queuedHearing = run(thinking, { type: "speech.start", at: 2000 });
  const queuedPausing = run(queuedHearing, { type: "speech.stop", at: 2100 });
  const queuedReady = run(queuedPausing, {
    type: "countdown.ended",
    at: 3600,
    startedAt: 2100,
    text: "also add tests",
  });

  it("does not change stage, it tracks the queued speech instead", () => {
    expect(queuedHearing.stage).toBe("thinking");
    expect(queuedHearing.queued).toEqual({ phase: "hearing", pauseStartedAt: null, text: "" });
    expect(speechPhase(queuedHearing)).toEqual({ phase: "hearing", pauseStartedAt: null });
    expect(queuedPausing.queued?.phase).toBe("pausing");
    expect(speechPhase(queuedPausing)).toEqual({ phase: "pausing", pauseStartedAt: 2100 });
  });

  it("holds the request as Queued instead of sending it", () => {
    expect(queuedReady.queued).toEqual({ phase: "ready", pauseStartedAt: null, text: "also add tests" });
    expect(queuedReady.utteranceSeq).toBe(queuedPausing.utteranceSeq);
    expect(queuedReady.announcement?.text).toMatch(/queued/i);
  });

  it("sends the queued request on agent.done (-> cleaning)", () => {
    const s = run(queuedReady, server({ type: "agent.done", runId: "r1", ok: true }, 4000));
    expect(s.stage).toBe("cleaning");
    expect(s.queued).toBeNull();
    expect(s.utteranceSeq).toBe(queuedReady.utteranceSeq + 1);
  });

  it("continues an in-progress queued utterance on agent.done", () => {
    expect(run(queuedHearing, server({ type: "agent.done", runId: "r1", ok: true })).stage).toBe("hearing");
    const s = run(queuedPausing, server({ type: "agent.done", runId: "r1", ok: true }));
    expect(s.stage).toBe("pausing");
    expect(s.pauseStartedAt).toBe(2100);
  });

  it("keeps only one queued request (more speech extends it)", () => {
    const s = run(queuedReady, { type: "speech.start", at: 3700 });
    expect(s.queued).toEqual({ phase: "hearing", pauseStartedAt: null, text: "also add tests" });
  });

  it("drops an unfinished queued utterance when the mic is turned off, keeps a ready one", () => {
    expect(run(queuedHearing, { type: "mic.toggled", on: false }).queued).toBeNull();
    expect(run(queuedReady, { type: "mic.toggled", on: false }).queued?.phase).toBe("ready");
  });

  it("treats cleaning, thinking and responding as busy", () => {
    expect(isAgentBusy(cleaning)).toBe(true);
    expect(isAgentBusy(thinking)).toBe(true);
    expect(isAgentBusy(responding)).toBe(true);
    expect(isAgentBusy(live)).toBe(false);
  });
});

describe("mic status", () => {
  it("records a denied mic and announces it", () => {
    const s = run(initialState, { type: "mic.status", status: "denied" });
    expect(s.mic).toBe("denied");
    expect(s.announcement?.text).toMatch(/denied/i);
  });

  it("announces the autoplay prompt when audio is suspended", () => {
    const s = run(initialState, { type: "mic.status", status: "suspended" });
    expect(s.announcement?.text).toBe("Press any key to start listening");
  });

  it("ignores speech until the mic is granted", () => {
    const s = run({ ...live, mic: "suspended" }, { type: "speech.start", at: 1 });
    expect(s.stage).toBe("listening");
  });
});

describe("connection", () => {
  it("is tracked separately from stage", () => {
    const s = run(hearing, { type: "connection", status: "connecting", retryInMs: null, at: 0 });
    expect(s.stage).toBe("hearing");
    expect(s.connection.status).toBe("connecting");
  });

  it("on close: abandons in-flight work, fails active runs and announces once", () => {
    const s = run(responding, { type: "connection", status: "closed", retryInMs: 1000, at: 5000 });
    expect(s.stage).toBe("listening");
    expect(s.connection).toEqual({ status: "closed", retryInMs: 1000 });
    expect(s.runs[0]).toMatchObject({ status: "failed", endedAt: 5000 });
    expect(s.announcement?.text).toMatch(/connection lost/i);
    const again = run(s, { type: "connection", status: "closed", retryInMs: 2000, at: 6000 });
    expect(again.announcement).toBe(s.announcement);
  });

  it("keeps paused when the connection drops", () => {
    const s = run(live, { type: "mic.toggled", on: false }, { type: "connection", status: "closed", retryInMs: 500, at: 0 });
    expect(s.stage).toBe("paused");
  });

  it("ignores speech while the connection is not open", () => {
    const closed = run(live, { type: "connection", status: "closed", retryInMs: 500, at: 0 });
    expect(run(closed, { type: "speech.start", at: 1 }).stage).toBe("listening");
  });

  it("announces reconnection", () => {
    const closed = run(live, { type: "connection", status: "closed", retryInMs: 500, at: 0 });
    const s = run(closed, { type: "connection", status: "open", retryInMs: null, at: 1 });
    expect(s.announcement?.text).toMatch(/reconnected/i);
  });
});

describe("errors and robustness", () => {
  it("stores and announces bridge errors, and un-sticks cleaning", () => {
    const s = run(cleaning, server({ type: "error", code: "stt", message: "Transcription failed", recoverable: true }));
    expect(s.error).toEqual({ code: "stt", message: "Transcription failed", recoverable: true });
    expect(s.announcement?.text).toBe("Transcription failed");
    expect(s.stage).toBe("listening");
  });

  it("ignores agent messages for unknown runs", () => {
    const s = run(thinking, server({ type: "agent.text", runId: "nope", delta: "x" }));
    expect(s).toBe(thinking);
  });

  it("ignores a duplicate agent.start", () => {
    const s = run(thinking, server({ type: "agent.start", runId: "r1" }));
    expect(s.runs).toHaveLength(1);
  });

  it("transcript.partial does not change state (it lives in the partial store)", () => {
    expect(run(hearing, server({ type: "transcript.partial", id: "u1", text: "add" }))).toBe(hearing);
  });

  it("announcement ids increase so repeats are still announced", () => {
    const a = run(live, { type: "mic.toggled", on: false });
    const b = run(a, { type: "mic.toggled", on: true }, { type: "mic.toggled", on: false });
    expect(b.announcement?.text).toBe(a.announcement?.text);
    expect(b.announcement!.id).toBeGreaterThan(a.announcement!.id);
  });
});
