# UPDATE — pulled bridge work (2026-11-14)

`git pull` brought in 4 commits from `origin/main` (783078a → 74632be). They add a working client for the Go bridge, a Docker image, and runtime configuration for the bridge URL. This document covers what arrived, how it fits with the CLAUDE.md implementation in the working tree (see `COMPLETED.md`), and **what has to happen to connect the two**. That last part is the next step.

## What was pulled

| Commit | Summary |
| --- | --- |
| `5b78586` 🚀 added Dockerfile | Two-stage image: `oven/bun:1` builds `dist/`, `nginx:alpine` serves it on port 80. Adds `.dockerignore`. |
| `dd28bb1` ✨ added bridge components for the voice session | `src/bridge/` (WebSocket + mic client, React provider and hook) and a debug UI in `src/components/` (`BridgeTest`, `BridgeStatus`, `TalkControls`, `TextPrompt`, `EventLog`, `bridge.css`, `index.ts`). `App.tsx` was replaced so that it mounts `BridgeTest`. |
| `bb821ca` 🔧 read the bridge url and sample rate from the environment | `src/bridge/env.ts`, `public/config.js`, `docker-entrypoint.sh`, `src/vite-env.d.ts`, a `<script src="/config.js">` in `index.html`, and `envPrefix` in `vite.config.ts`. |
| `74632be` 🎤 connect and listen when the app opens | The provider auto-connects on mount and starts the mic once connected. The status shows "listening". |

All four commits are by Stephen Sulimani.

### New files and what they do

- **`src/bridge/env.ts`** reads two settings. It checks, in order: the runtime `window.__VOICECODER__` (from `/config.js`), then a build-time `import.meta.env`, then a fallback.
  - `DEFAULT_BRIDGE_URL`, default **`ws://localhost:8000/ws`**
  - `TARGET_SAMPLE_RATE`, default **`16000`**
- **`public/config.js`** is `window.__VOICECODER__ = {}` in dev. In Docker, **`docker-entrypoint.sh`** rewrites it at container start from the `DEFAULT_BRIDGE_URL` / `TARGET_SAMPLE_RATE` env vars. That means one image can point at any bridge without a rebuild:
  ```
  docker build -t voicecoder-frontend .
  docker run -p 8081:80 -e DEFAULT_BRIDGE_URL=wss://bridge.example/ws voicecoder-frontend
  ```
- **`src/bridge/audio.ts`** opens the mic with `getUserMedia({ audio: true })` and a `ScriptProcessorNode` (4096-sample buffers at the native rate). It downsamples each buffer to mono PCM16 at `TARGET_SAMPLE_RATE` and sends it as a binary frame.
- **`src/bridge/types.ts`** defines the message shapes the bridge speaks (see the comparison below) and a hand-written `parseServerMessage`.
- **`src/bridge/VoiceCoderProvider.tsx` + `useVoiceCoder.ts`** hold the socket and mic lifecycle (with generation counters for StrictMode), an event log, and `partial` / `transcript` / `cleaned` state. They expose `connect`, `disconnect`, `startTalking`, `stopTalking`, `sendText`, `clearEvents`. The provider uses `"use no memo"` because, per its comment, *"the React compiler drops the socket effect in this component"*.
- **`src/components/BridgeTest.tsx` and related files** are a plain debug page: status, Connect / Start talking / End buttons, a text prompt ("Send as text") and a raw event log.

## How the pull was merged with the local work

The CLAUDE.md implementation was still uncommitted, so I ran:

1. `git stash push -u` to save all local work, tracked and untracked.
2. `git pull --ff-only` to fast-forward `main` to `74632be`.
3. `git stash pop` to reapply the local work. `index.html` and `vite.config.ts` merged automatically; they now have **both** the `/config.js` script and `envPrefix` from upstream **and** the local dev proxy and Vitest config.
4. **Conflict in `src/App.tsx`: I kept the local CLAUDE.md `App`** (header, activity panel, editor). Upstream's `App` only mounted `<BridgeTest />`. **`BridgeTest` and all of `src/bridge/` are still in the tree**, just not mounted. To view the debug page temporarily, render `<VoiceCoderProvider><BridgeTest /></VoiceCoderProvider>` from `App.tsx`.
5. Because the pop hit a conflict, git **kept the stash as a backup** (`stash@{0}`, "local CLAUDE.md implementation (before pulling bridge work)"). Drop it with `git stash drop` once you're happy with the merge.

Nothing was committed. Everything is still in the working tree.

### Checks after the merge

| Check | Result |
| --- | --- |
| `tsc -b` | ✅ clean. Upstream code also passes the stricter `strict` / `noUncheckedIndexedAccess` settings. |
| `npm run lint` (incl. jsx-a11y strict) | ✅ clean, upstream files included |
| `npm test` | ✅ 107/107 |
| `vite build` | ✅ |
| **`docker build .`** | ❌ **fails**, see below |

### ❌ The Docker build is broken by the local changes, not by upstream

The Dockerfile runs `bun install --frozen-lockfile` against `bun.lock`. The local work added dependencies (`react-markdown`, `@fontsource/*`, Vitest, Testing Library, Playwright, jsx-a11y…) and an `overrides` entry to `package.json`, but those only went into `package-lock.json`, because bun wasn't installed locally. I ran the build to confirm:

```
error: lockfile had changes, but lockfile is frozen
note: overrides in package.json changed since bun.lock was saved
```

**Fix (not applied; your call):** regenerate `bun.lock` with the same bun the image uses, then commit it:

```
docker run --rm -v "$PWD":/app -w /app oven/bun:1 bun install --lockfile-only
```

After that, decide on **one** package manager. The image uses bun, but `package-lock.json` (npm) now exists too. Keeping both will keep drifting.

## ⚠️ The important part: the real bridge protocol is not the CLAUDE.md protocol

The pulled client shows what the bridge **actually** sends and accepts. It differs from `CLAUDE.md` / `src/domain/protocol.ts` in almost every message. I'm inferring the bridge's behaviour from this client code only; I haven't seen the Go bridge's source, so confirm with the bridge owner (#2).

| Topic | CLAUDE.md / local `protocol.ts` | Real bridge (from `src/bridge/`) |
| --- | --- | --- |
| WebSocket URL | Same origin, `/ws` (built from `location`) | **Configurable**, default `ws://localhost:8000/ws` (a different host or port from the page) |
| Start audio | `{ type: "mic.start" }` | `{ type: "start" }` |
| Stop audio | `{ type: "mic.stop" }` | `{ type: "end" }` |
| End of utterance | `{ type: "utterance.end" }` after a 1.5 s pause countdown | Also `{ type: "end" }`. The pulled client is **push-to-talk**: "speak, then press End". It stops the mic and waits for a transcript. |
| Typed prompt | — (not in the protocol) | `{ type: "text", text }` |
| Keep-alive | `{ type: "ping" }` (added locally) | — (unknown whether the bridge tolerates it) |
| Live words | `transcript.partial { id, text }` | `partial { seq, text }` |
| Final words | `transcript.final { id, raw, cleaned }` (one message) | **Two messages**: `transcript { text }`, then `cleaned { text }` |
| Agent output | `agent.start` / `agent.text` / `agent.done` | **None.** The bridge sends no agent messages yet. |
| Bridge info | — | `status { text }` (free text) |
| Errors | `error { code, message, recoverable }` | `error { text }` |
| Audio format | 16 kHz mono PCM16, ~100 ms frames from an AudioWorklet | `TARGET_SAMPLE_RATE` (default 16 kHz) mono PCM16, one frame per 4096 native samples (~85 ms at 48 kHz) from a ScriptProcessor |
| VS Code Web | `/editor/` on the same origin | Not served by the frontend container; where it lives is undecided |

What this means:

- If you run the local UI against the real bridge, **zod rejects every bridge message** (they're logged and ignored, as designed), and the bridge gets `mic.start` / `utterance.end`, which it doesn't recognise. The two halves **won't talk to each other until the protocol is reconciled**.
- **No agent replies will appear in either UI** until the agent runner (#3) streams something through the bridge. `AgentReply`, queueing and "Agent finished" are all waiting on that.
- **Same-origin no longer holds.** In Docker, nginx serves only `dist/` on :80 and the bridge is elsewhere (:8000 by default). `wsUrlFrom(location)` and `EDITOR_SRC = "/editor/…"` will both point at the nginx container and fail. Also, the local Vite dev proxy targets `:8080`, but the bridge default is `:8000`.

## Next step: bridging the pieces

Recommended order:

1. **Agree on one protocol with the bridge owner (#2).** Either the bridge adopts the CLAUDE.md messages, or `protocol.ts` changes to match the bridge, as CLAUDE.md says: change `protocol.ts` first, then tell the team. Open questions for #2:
   - After `end`, does the bridge accept more audio, or does every utterance need a new `start`? This decides whether hands-free mode (mic always on, automatic end-of-speech) works or whether the bridge is push-to-talk only.
   - Will `cleaned` always follow `transcript`, and can the two be tied to the same utterance (e.g. an `id`/`seq`)?
   - What does the bridge do with an unknown message such as `ping`?
   - When will agent text arrive, and in what shape (`agent.start` / `agent.text` / `agent.done`, or something else)?
   - Is there a structured error code and a recoverable flag?
2. **Add the configuration from the pulled work to the local services.** In `src/main.tsx`, build `WebSocketTransport` from `DEFAULT_BRIDGE_URL` (`src/bridge/env.ts`) instead of `wsUrlFrom(location)`, and pass `TARGET_SAMPLE_RATE` to `MicAudio` / the worklet's `targetSampleRate`. Add an `EDITOR_URL` setting to `config.js` / `docker-entrypoint.sh` the same way, for `EditorFrame`. Point the Vite dev proxy (or `BRIDGE_ORIGIN`) at `:8000`.
3. **Adapt the transport, not the UI.** The cleanest fit for the CLAUDE.md architecture is to translate inside `services/transport/`, either by updating `protocol.ts` and the zod schemas or with a small adapter, so the reducer and components stay unchanged. For example:
   - `partial` → `transcript.partial`
   - `transcript` + `cleaned` → one `transcript.final`
   - `error { text }` → `error { code: "bridge", message, recoverable: true }`
   - `status` → an announcement
   - `mic.start` → `start`, `utterance.end` → `end`
4. **Keep the better pieces of each side, and remove the duplicate client.**
   - The local client has zod validation, reconnect with backoff, an AudioWorklet (the pulled code uses `ScriptProcessorNode`, which is deprecated and runs on the main thread), autoplay handling, and the accessible UI. Note that the pulled `EventLog` puts raw partials into an `aria-live` region, which CLAUDE.md explicitly forbids.
   - The pulled work has runtime config, Docker, and real knowledge of the bridge. It also has a typed-prompt fallback (`text`); CLAUDE.md doesn't mention one, so ask before adding it to the main UI.
   - Once the transport speaks the real protocol, retire `src/bridge/VoiceCoderProvider.tsx` and the debug components, or keep `BridgeTest` as a dev-only page.
5. **Check the React Compiler note.** The pulled provider needed `"use no memo"`. The local `SessionProvider` runs under the compiler in the unit tests and in Playwright without problems, but re-test it against a real socket.
6. **Fix the Docker build** (regenerate `bun.lock`, see above). Then consider having nginx reverse-proxy `/ws` (and `/editor/`) to the bridge, which would make the page same-origin again and match CLAUDE.md's assumption.
7. Then do the real end-to-end test: the bridge running, `npm run dev`, a real mic, and Playwright with `--use-file-for-fake-audio-capture=<wav>`.
