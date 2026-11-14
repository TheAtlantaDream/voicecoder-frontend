// Wire protocol with the Go bridge. If this has to change, change it here
// first and tell the team: never invent a message type silently.
import { z } from "zod";

// ---------- Client -> bridge ----------
// Binary frames (16 kHz mono PCM16, ~100 ms each) are sent separately.
export type ClientMsg =
  | { type: "mic.start" }
  | { type: "mic.stop" }
  | { type: "utterance.end" }
  // Keep-alive sent every 15 s by WebSocketTransport. The bridge should ignore it.
  | { type: "ping" };

// ---------- Bridge -> client ----------
export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcript.partial"), id: z.string(), text: z.string() }),
  z.object({
    type: z.literal("transcript.final"),
    id: z.string(),
    raw: z.string(),
    cleaned: z.string(),
  }),
  z.object({ type: z.literal("agent.start"), runId: z.string() }),
  z.object({ type: z.literal("agent.text"), runId: z.string(), delta: z.string() }),
  z.object({ type: z.literal("agent.done"), runId: z.string(), ok: z.boolean() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;

/**
 * Parses one text frame from the bridge. A bad message is logged and ignored
 * (returns null), never thrown.
 */
export function parseServerMsg(raw: string): ServerMsg | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.warn("[protocol] ignoring non-JSON message", raw);
    return null;
  }
  const result = ServerMsg.safeParse(json);
  if (!result.success) {
    console.warn("[protocol] ignoring invalid message", json, result.error.issues);
    return null;
  }
  return result.data;
}

/** Same-origin WebSocket URL: ws: for http:, wss: for https:. Never hard-code a host. */
export function wsUrlFrom(location: { protocol: string; host: string }, path = "/ws"): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${path}`;
}
