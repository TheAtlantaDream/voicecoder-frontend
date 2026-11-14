// Demo scripts for FakeTransport (VITE_FAKE=1). Same content as the wireframe
// prototype: an email-validator request and a 3-paragraph reply.
import type { ServerMsg } from "../../domain/protocol";

export type ScriptStep =
  /** Simulated voice activity, delivered through FakeAudio. */
  | { after: number; voice: "start" | "stop" }
  | { after: number; msg: ServerMsg }
  /** Pause playback until the client sends this message. */
  | { waitFor: "utterance.end" };

const SPOKEN = "um so can you add a function that checks if an email address is valid and like returns true or false";

const CLEANED =
  "Add a function that checks whether an email address is valid and returns true or false.";

const REPLY = `I added \`isValidEmail(email: string): boolean\` to **src/utils/validation.ts**. It trims the input, then checks for exactly one \`@\`, a non-empty local part, and a domain that contains at least one dot with no empty labels.

It deliberately does not try to implement the full RFC 5322 grammar. That spec allows addresses almost nobody uses, and a stricter check would reject real users. If you need to know an address actually works, sending a confirmation email is the reliable test.

I also added tests in **src/utils/validation.test.ts** covering valid addresses, missing \`@\`, double \`@\`, empty parts and trailing dots. All of them pass.`;

/** Splits text into small chunks, like a streamed model reply. */
function chunks(text: string, size = 3): string[] {
  const words = text.split(/(?<=\s)/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(""));
  return out;
}

function partials(id: string, text: string, every: number): ScriptStep[] {
  const words = text.split(" ");
  return words.map((_, i) => ({
    after: every,
    msg: { type: "transcript.partial", id, text: words.slice(0, i + 1).join(" ") },
  }));
}

export const emailValidatorScript: ScriptStep[] = [
  { after: 1500, voice: "start" },
  ...partials("u1", SPOKEN, 180),
  { after: 200, voice: "stop" },
  { waitFor: "utterance.end" },
  { after: 700, msg: { type: "transcript.final", id: "u1", raw: SPOKEN, cleaned: CLEANED } },
  { after: 400, msg: { type: "agent.start", runId: "run-1" } },
  ...chunks(REPLY).map((delta, i): ScriptStep => ({
    after: i === 0 ? 1600 : 60,
    msg: { type: "agent.text", runId: "run-1", delta },
  })),
  { after: 300, msg: { type: "agent.done", runId: "run-1", ok: true } },
];
