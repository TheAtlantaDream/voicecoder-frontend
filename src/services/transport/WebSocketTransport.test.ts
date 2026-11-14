import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, PING_INTERVAL_MS, WebSocketTransport } from "./WebSocketTransport";
import type { ConnectionStatusEvent } from "./Transport";

class MockSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockSocket[] = [];

  readyState = MockSocket.CONNECTING;
  binaryType = "blob";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;

  url: string;
  constructor(url: string) {
    this.url = url;
    MockSocket.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockSocket.CLOSED;
  }
  // test helpers
  serverOpen() {
    this.readyState = MockSocket.OPEN;
    this.onopen?.();
  }
  serverDrop() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }
  serverSend(data: unknown) {
    this.onmessage?.({ data });
  }
}

const latest = () => MockSocket.instances[MockSocket.instances.length - 1]!;

function make(random = () => 1) {
  const t = new WebSocketTransport("ws://test/ws", {
    random,
    WebSocketImpl: MockSocket as unknown as typeof WebSocket,
  });
  const statuses: ConnectionStatusEvent[] = [];
  t.onStatus((s) => statuses.push(s));
  return { t, statuses };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backoffDelay", () => {
  it("doubles from 500 ms and caps at 10 s", () => {
    const max = () => 1;
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a, max))).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
  });

  it("applies jitter (between half and the full delay)", () => {
    expect(backoffDelay(2, () => 0)).toBe(1000);
    expect(backoffDelay(2, () => 0.5)).toBe(1500);
  });
});

describe("WebSocketTransport", () => {
  it("uses arraybuffer binaryType and reports connecting -> open", () => {
    const { t, statuses } = make();
    t.connect();
    expect(latest().binaryType).toBe("arraybuffer");
    latest().serverOpen();
    expect(statuses.map((s) => s.status)).toEqual(["connecting", "open"]);
  });

  it("reconnects with exponential backoff after drops", () => {
    const { t, statuses } = make();
    t.connect();
    latest().serverDrop();
    expect(statuses.at(-1)).toEqual({ status: "closed", retryInMs: 500 });
    vi.advanceTimersByTime(499);
    expect(MockSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockSocket.instances).toHaveLength(2);
    latest().serverDrop();
    expect(statuses.at(-1)).toEqual({ status: "closed", retryInMs: 1000 });
    vi.advanceTimersByTime(1000);
    latest().serverOpen();
    latest().serverDrop();
    // a successful open resets the backoff
    expect(statuses.at(-1)).toEqual({ status: "closed", retryInMs: 500 });
  });

  it("retryNow skips the wait", () => {
    const { t } = make();
    t.connect();
    latest().serverDrop();
    t.retryNow();
    expect(MockSocket.instances).toHaveLength(2);
  });

  it("sends JSON and audio only while open, never replaying old audio", () => {
    const { t } = make();
    t.connect();
    t.sendAudio(new ArrayBuffer(4));
    t.send({ type: "mic.start" });
    const first = latest();
    expect(first.sent).toEqual([]);
    first.serverOpen();
    const frame = new ArrayBuffer(8);
    t.sendAudio(frame);
    t.send({ type: "utterance.end" });
    expect(first.sent).toEqual([frame, '{"type":"utterance.end"}']);
    first.serverDrop();
    t.sendAudio(new ArrayBuffer(2));
    vi.advanceTimersByTime(500);
    latest().serverOpen();
    expect(latest().sent).toEqual([]);
  });

  it("pings every 15 s while open", () => {
    const { t } = make();
    t.connect();
    latest().serverOpen();
    vi.advanceTimersByTime(PING_INTERVAL_MS * 2);
    expect(latest().sent).toEqual(['{"type":"ping"}', '{"type":"ping"}']);
  });

  it("delivers valid messages and ignores bad JSON / bad schema without throwing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t } = make();
    const got: unknown[] = [];
    t.onMessage((m) => got.push(m));
    t.connect();
    latest().serverOpen();
    expect(() => {
      latest().serverSend("not json");
      latest().serverSend(JSON.stringify({ type: "agent.done" }));
      latest().serverSend(new ArrayBuffer(3));
      latest().serverSend(JSON.stringify({ type: "agent.start", runId: "r1" }));
    }).not.toThrow();
    expect(got).toEqual([{ type: "agent.start", runId: "r1" }]);
  });

  it("close() stops reconnecting and can connect again (StrictMode)", () => {
    const { t, statuses } = make();
    t.connect();
    latest().serverDrop();
    t.close();
    expect(statuses.at(-1)).toEqual({ status: "closed", retryInMs: null });
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(1);
    t.connect();
    expect(MockSocket.instances).toHaveLength(2);
  });
});
