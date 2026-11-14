import { parseServerMsg, type ClientMsg, type ServerMsg } from "../../domain/protocol";
import { Emitter } from "../emitter";
import type { ConnectionStatusEvent, Transport } from "./Transport";

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 10_000;
export const PING_INTERVAL_MS = 15_000;

/** Exponential backoff (500 ms doubling, capped at 10 s) with jitter in [50%, 100%]. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

interface Options {
  random?: () => number;
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private messages = new Emitter<ServerMsg>();
  private statuses = new Emitter<ConnectionStatusEvent>();
  private readonly url: string;
  private readonly random: () => number;
  private readonly WS: typeof WebSocket;

  constructor(url: string, opts: Options = {}) {
    this.url = url;
    this.random = opts.random ?? Math.random;
    this.WS = opts.WebSocketImpl ?? WebSocket;
  }

  connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.open();
  }

  close(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    }
    this.statuses.emit({ status: "closed", retryInMs: null });
  }

  retryNow(): void {
    if (this.stopped || this.ws) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.open();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === this.WS.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendAudio(buf: ArrayBuffer): void {
    // Not buffered on purpose: old audio is never replayed after a reconnect.
    if (this.ws?.readyState === this.WS.OPEN) this.ws.send(buf);
  }

  onMessage(cb: (msg: ServerMsg) => void) {
    return this.messages.on(cb);
  }

  onStatus(cb: (status: ConnectionStatusEvent) => void) {
    return this.statuses.on(cb);
  }

  private open(): void {
    this.statuses.emit({ status: "connecting", retryInMs: null });
    const ws = new this.WS(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.statuses.emit({ status: "open", retryInMs: null });
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_INTERVAL_MS);
    };
    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") {
        console.warn("[ws] ignoring binary message from bridge");
        return;
      }
      const msg = parseServerMsg(event.data);
      if (msg) this.messages.emit(msg);
    };
    // onerror is always followed by onclose; reconnect is handled there.
    ws.onerror = () => {};
    ws.onclose = () => {
      this.ws = null;
      this.clearTimers();
      if (this.stopped) return;
      const delay = backoffDelay(this.attempt++, this.random);
      this.statuses.emit({ status: "closed", retryInMs: delay });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.open();
      }, delay);
    };
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
  }
}
