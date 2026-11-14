# BRIDGE_INTEGRATION.md — connecting the front end to the real Go bridge

**Status:** authoritative. The bridge work pulled on 2026-11-14 (commits `5b78586`, `dd28bb1`, `bb821ca`, `74632be`, in `src/bridge/`, `Dockerfile`, `docker-entrypoint.sh`, `public/config.js`) is **correct by definition**. The front end built from `CLAUDE.md` (`src/domain`, `src/services`, `src/app`, `src/components`) must change to match it.

**Precedence:** where this file and `CLAUDE.md` disagree, **this file wins**. In particular it replaces CLAUDE.md's "Protocol with the Go bridge" section, the same-origin rule, the `/ws` path rule, and the parts of the session state machine that depend on agent messages. Everything else in `CLAUDE.md` still applies: the accessibility rules, the architecture and dependency direction, the design, the testing requirements and the out-of-scope list.

Background: `COMPLETED.md` (what the CLAUDE.md implementation contains) and `UPDATE.md` (how the pull was merged).

---

## 1. Configuration

The bridge location and audio rate are **runtime configuration**. They are not derived from `location`.

| Setting | Default | Where it comes from (first match wins) |
| --- | --- | --- |
| `DEFAULT_BRIDGE_URL` | `ws://localhost:8000/ws` | 1. `window.__VOICECODER__.DEFAULT_BRIDGE_URL` (from `/config.js`) · 2. `import.meta.env.DEFAULT_BRIDGE_URL` (build time; `envPrefix` in `vite.config.ts` allows it) · 3. the default |
| `TARGET_SAMPLE_RATE` | `16000` | the same order; invalid or non-positive values fall back to the default |

- **Reader:** `src/bridge/env.ts` exports `DEFAULT_BRIDGE_URL` and `TARGET_SAMPLE_RATE`. Use these exports; don't write a second reader.
- **`/config.js`** is loaded by a classic `<script>` in `index.html` **before** the app module. In dev it's `public/config.js` (`window.__VOICECODER__ = {}`). In Docker, `docker-entrypoint.sh` rewrites it at container start from the env vars of the same names:
  ```
  docker run -p 8081:80 -e DEFAULT_BRIDGE_URL=wss://bridge.example/ws -e TARGET_SAMPLE_RATE=16000 voicecoder-frontend
  ```
- **Deployment shape:** nginx serves only `dist/` (port 80). The bridge is a **separate origin**: by default another port (`:8000`) and possibly another host. Nothing is same-origin anymore.
- **Package manager:** **bun**. The image runs `bun install --frozen-lockfile` and `bun run build`, so `bun.lock` must stay in sync with `package.json`.

## 2. Transport

- One WebSocket to `DEFAULT_BRIDGE_URL`.
- **Text frames** carry JSON control messages in both directions.
- **Binary frames** (client → bridge) carry audio.
- **Connect automatically when the app opens** and **start listening as soon as the socket is open** (commit `74632be`). This matches CLAUDE.md's "mic on by default".
- The bridge protocol has **no keep-alive or ping message**.

## 3. Client → bridge messages

| Message | When |
| --- | --- |
| `{ "type": "start" }` | The mic has started and audio for a new utterance will follow. |
| `{ "type": "end" }` | The utterance is over: the bridge transcribes and cleans what it got since `start`. The reference client also stops its mic here. |
| `{ "type": "text", "text": string }` | A typed prompt, sent instead of speech. It's ignored if empty. |
| *binary* | Audio, see §5. Only while between `start` and `end`. |

These are the **only** client messages. `mic.start`, `mic.stop`, `utterance.end` and `ping` from the old `protocol.ts` must not be sent.

## 4. Bridge → client messages

| Message | Meaning | Reference client behaviour |
| --- | --- | --- |
| `{ "type": "partial", "seq": number, "text": string }` | Live, raw, provisional transcript; arrives many times | Shows the latest text as the current partial |
| `{ "type": "transcript", "text": string }` | Final raw transcript of the utterance | Stored as the transcript |
| `{ "type": "cleaned", "text": string }` | Cleaned-up version, the request as it will be acted on; arrives after `transcript` | Stored as the cleaned text |
| `{ "type": "status", "text": string }` | Free-text bridge status / info | Logged |
| `{ "type": "error", "text": string }` | Free-text error | Logged as an error |

Parsing rules from `src/bridge/types.ts`, which the new zod schemas must keep:
- A missing or non-string `text` becomes `""`.
- A missing or non-number `seq` becomes `0`.
- An unknown `type`, non-JSON, or a binary frame from the bridge is **logged and ignored**, never thrown.

**There are no agent messages** (`agent.start`, `agent.text`, `agent.done`). The bridge does not stream agent replies today.

## 5. Audio format

- Mono, **signed 16-bit little-endian PCM** at `TARGET_SAMPLE_RATE` Hz, sent as raw binary WebSocket frames (no header, no JSON wrapper).
- Conversion: take channel 0, clamp to [-1, 1], multiply by 32767, truncate to an integer. The reference client uses nearest-sample downsampling (`input[floor(i * sampleRate / TARGET_SAMPLE_RATE)]`).
- Frame size isn't significant. The reference client sends one frame per 4096 native samples (~85 ms at 48 kHz); the local worklet's ~100 ms frames are fine.
- Send `start` **before** the first audio frame of an utterance. Send no audio after `end` until the next `start`.

## 6. Utterance lifecycle

```
open socket -> start -> [binary audio ...] -> end -> partial* -> transcript -> cleaned
                 ^                                                               |
                 +----------------------- next utterance ------------------------+
```

The reference client is **push-to-talk**: "speak, then press End". `end` stops the mic, and the user presses Start to talk again. The CLAUDE.md UI is **hands-free**: it detects the end of speech after `END_OF_SPEECH_MS` of silence. Both fit the protocol like this:

- The pause countdown finishing sends `end`. This replaces `utterance.end`.
- Right after `end`, the client sends `start` for the next utterance and resumes sending audio. The mic hardware stays on; only the protocol framing restarts.
- The user turning the mic off sends `end`, and only if an utterance is in progress (`start` sent and no `end` yet). Turning it back on sends `start`.
- A socket drop counts as an implicit `end`. After reconnecting, send `start` again if the mic is on. Never replay audio from before the drop.

> Open question for the bridge owner (#2): does the bridge accept a `start` immediately after `end`, while the previous utterance is still being transcribed? If not, wait for `cleaned` (or `error`) before sending the next `start`, and drop audio in between. Implement the "wait for `cleaned`" variant behind a single flag so it can be switched.

## 7. Required front-end changes (by file)

### `src/domain/protocol.ts`
- `ClientMsg` = `start | end | text` exactly as in §3. Remove `mic.start`, `mic.stop`, `utterance.end` and `ping`.
- `ServerMsg` = zod schemas for `partial | transcript | cleaned | status | error` as in §4, including the `""` / `0` defaults. Remove the `transcript.partial`, `transcript.final`, `agent.*` and structured `error` schemas.
- Delete `wsUrlFrom`. The URL comes from `DEFAULT_BRIDGE_URL`.
- `parseServerMsg` keeps its contract: log and return `null` on bad input, never throw.

### `src/domain/session.ts` (+ `session.test.ts`: one test per transition, written first)

The stages stay. Their triggers change:

- `listening -> hearing` (speech detected) · `hearing -> pausing` (silence) · `pausing -> hearing` (speech resumes): **unchanged**.
- `pausing -> cleaning`: the countdown ended. The reducer bumps `utteranceSeq`; the provider sends `end`, then `start`.
- On `transcript`: store the raw text on the pending request. The stage stays `cleaning`.
- `cleaning -> listening` on `cleaned`: show the cleaned text as the "Sent to agent" card. Because the bridge sends no agent messages, **go back to `listening`**; don't go to `thinking`.
- `error` (while `cleaning`) `-> listening`: announce the error text.
- `any -> paused` / `paused -> listening`: unchanged (the mic toggle).
- `status`: store the latest status text for display. Don't change stage.

Agent runs, `thinking`/`responding` and queueing have no trigger now. Keep the types and components (`AgentReply`, `QueuedRequest`) so agent output can return later. Remove their transitions from the reducer only if you can't keep them without inventing messages, and **never invent `agent.*` messages**. Speech during `cleaning` follows the existing queue logic; the queued utterance is sent (`end`/`start` cycle) once `cleaned` or `error` arrives.

- `error` becomes `{ message: string }` (no `code` or `recoverable`).
- The connection status model (`connecting | open | closed` + `retryInMs`) stays.

### `src/services/transport/WebSocketTransport.ts`
- Construct it from `DEFAULT_BRIDGE_URL` (in `main.tsx`).
- Remove the 15 s ping. Keep reconnect with backoff, `binaryType = "arraybuffer"`, and never buffering audio while closed. Reconnecting is client behaviour, not protocol.
- Keep `retryNow()`.

### `src/services/audio/MicAudio.ts` + `public/pcm-worklet.js`
- Target rate = `TARGET_SAMPLE_RATE` (pass it into `MicAudio` from `main.tsx`; the worklet already takes `targetSampleRate`). Request `AudioContext({ sampleRate: TARGET_SAMPLE_RATE })` with the existing native-rate fallback.
- Keep the CLAUDE.md `getUserMedia` constraints (echo cancellation, noise suppression), the secure-context check, the error mapping, the autoplay handling and the AudioWorklet. The PCM output must match §5.

### `src/app/SessionProvider.tsx`
- Send the §6 framing: `start` when the socket is open, the mic is granted and on; `end` + `start` on each `utteranceSeq` bump; `end` when the mic is turned off mid-utterance; `start` again after a reconnect.
- Route `partial` into the partial store (keep the latest; ignore a `seq` lower than the last one seen within the current utterance). Clear the store on `cleaned` and on `end`.
- Expose a new action, `sendText(text)` → `{ type: "text", text }`.

### Typed prompt (new UI, from the pulled `TextPrompt`)
Add an accessible text-prompt form to the activity panel: a native `<form>`, a labelled `<input>` and a submit `<button>`, disabled unless the socket is open, cleared after sending. It's a secondary path. The mic stays primary and on by default. Follow the CLAUDE.md definition of done: component `.tsx` + `.css` + `.test.tsx` with axe.

### `status` and `error` display
- Show the latest `status` text visibly in the panel. **Don't** put it in a live region, because it can be chatty.
- `error` text goes to the Announcer (polite) and is shown visibly.
- Never render partials in a live region. The pulled `EventLog` does this, so don't reuse that pattern in the main UI.

### `src/components/EditorFrame.tsx` and config
Same-origin `/editor/` no longer exists. Add an `EDITOR_URL` setting the same way as the others:
- a key in `window.__VOICECODER__`
- a line in `docker-entrypoint.sh` and an `ENV`/`ARG` in the `Dockerfile`
- a reader in `src/bridge/env.ts`
- added to `envPrefix`

Default it to `/editor/?folder=/home/coder/project`. If it's empty, EditorFrame shows its "Open the editor in a new tab" state, or the placeholder. **These are additive edits to the teammate's files; keep their existing behaviour intact.**

### `src/main.tsx`
- Real services: `new WebSocketTransport(DEFAULT_BRIDGE_URL)` and `new MicAudio(TARGET_SAMPLE_RATE)`.
- Fake mode (`VITE_FAKE=1`) stays.

### `src/services/transport/FakeTransport.ts` + `scripts.ts`
- Rewrite the demo script in the new protocol: `partial` messages (increasing `seq`), wait for the client's `end`, then `transcript`, then `cleaned`, plus an occasional `status`.
- Drop the agent reply from the script (the bridge doesn't send one). Keep the email-validator request text.
- The demo must still run end to end with `VITE_FAKE=1` and no backend.

### `vite.config.ts`
Remove the `/ws` and `/editor` dev proxy and the `BRIDGE_ORIGIN` variable: the client connects straight to `DEFAULT_BRIDGE_URL`. Keep `envPrefix` (add `EDITOR_URL`) and the Vitest config.

### Package manager / Docker
- Regenerate `bun.lock` so `docker build .` passes: `bun install`, or without bun installed:
  ```
  docker run --rm -v "$PWD":/app -w /app oven/bun:1 bun install --lockfile-only
  ```
- Delete `package-lock.json` (bun is the package manager).
- Keep the `overrides` entry for `eslint-plugin-jsx-a11y`. If bun rejects it, report that instead of removing the plugin.

### `src/bridge/` and the pulled debug components
**Don't delete or rewrite them.** They're the reference implementation. The main `App` must not mount `VoiceCoderProvider` at the same time as `SessionProvider`, because that would open two sockets and two mics. Use `src/bridge/env.ts` from the new services; leave `src/bridge/types.ts` as the reference for the zod schemas.

### `CLAUDE.md`
- Replace the "Protocol with the Go bridge" section with a short pointer to this file.
- Change the same-origin and `/ws` wording, the "Commands" section (`bun`), and the state machine lines that mention `transcript.final`, `agent.*` and `utterance.end`, to match this file.

## 8. Tests that must pass when done

- `bun run test` (or `npm test`): every reducer transition above, protocol parsing including defaults and bad input, WebSocketTransport (backoff, no ping, no audio while closed), the text prompt with axe, and the App integration test running the new fake script.
- `bun run lint` and `bun run build` are clean.
- `npx playwright test`: the fake happy path updated to the new flow (speech → partial → countdown → `end` → "Sent to agent" with the cleaned text → back to listening), plus the existing keyboard, narrow and forced-colors checks.
- `docker build .` succeeds.
- Manual, against a running bridge: `DEFAULT_BRIDGE_URL` pointed at it, speak a request, see partial → cleaned, and confirm the next utterance works without touching anything (§6 open question).
