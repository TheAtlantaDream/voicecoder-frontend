import { afterEach, describe, expect, it, vi } from "vitest";
import { parseServerMsg, wsUrlFrom } from "./protocol";
import { initialVad, stepVad } from "./vad";

afterEach(() => vi.restoreAllMocks());

describe("parseServerMsg", () => {
  it("accepts every valid server message", () => {
    const msgs = [
      { type: "transcript.partial", id: "1", text: "hi" },
      { type: "transcript.final", id: "1", raw: "hi", cleaned: "Hi." },
      { type: "agent.start", runId: "r" },
      { type: "agent.text", runId: "r", delta: "x" },
      { type: "agent.done", runId: "r", ok: true },
      { type: "error", code: "c", message: "m", recoverable: false },
    ];
    for (const m of msgs) expect(parseServerMsg(JSON.stringify(m))).toEqual(m);
  });

  it("logs and ignores bad JSON without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseServerMsg("{nope")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("logs and ignores messages that fail the schema", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseServerMsg(JSON.stringify({ type: "agent.text", runId: "r" }))).toBeNull();
    expect(parseServerMsg(JSON.stringify({ type: "agent.tool_call", name: "edit" }))).toBeNull();
    expect(parseServerMsg("42")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe("wsUrlFrom", () => {
  it("matches ws/wss to http/https on the same host", () => {
    expect(wsUrlFrom({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
    expect(wsUrlFrom({ protocol: "https:", host: "coder.example.com" })).toBe("wss://coder.example.com/ws");
  });
});

describe("stepVad", () => {
  it("reports start after the onset and stop after the hang-over", () => {
    let s = initialVad;
    const events: string[] = [];
    for (const rms of [0.1, 0.1, 0.1, 0, 0, 0, 0]) {
      const r = stepVad(s, rms, 100);
      s = r.state;
      if (r.event) events.push(r.event);
    }
    expect(events).toEqual(["start", "stop"]);
  });

  it("ignores a single loud frame", () => {
    const r = stepVad(initialVad, 0.5, 100);
    expect(r.event).toBeNull();
  });
});
