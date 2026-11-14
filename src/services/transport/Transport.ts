import type { ClientMsg, ServerMsg } from "../../domain/protocol";
import type { ConnectionStatus } from "../../domain/session";

export type Unsubscribe = () => void;

export interface ConnectionStatusEvent {
  status: ConnectionStatus;
  /** When closed: ms until the next reconnect attempt (null if not reconnecting). */
  retryInMs: number | null;
}

export interface Transport {
  /** Opens the connection and keeps it open (reconnecting) until close(). Safe to call again after close(). */
  connect(): void;
  close(): void;
  /** Sends a JSON control message. Dropped if not connected. */
  send(msg: ClientMsg): void;
  /** Sends one binary PCM16 frame. Dropped (never buffered) if not connected. */
  sendAudio(buf: ArrayBuffer): void;
  /** Asks for an immediate reconnect attempt instead of waiting for the backoff timer. */
  retryNow(): void;
  onMessage(cb: (msg: ServerMsg) => void): Unsubscribe;
  onStatus(cb: (status: ConnectionStatusEvent) => void): Unsubscribe;
}
