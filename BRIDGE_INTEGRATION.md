# BRIDGE_INTEGRATION.md — how the VoiceCoder pieces fit together

**Snapshot (2026-11-14):**
- outer repo `VoiceCoder` `7c1c123`
- `bridge/` submodule `87fdb38`
- `frontend/` submodule `4f07fcf` (3 commits on top of `10e02a5`; **pushed only after `git push` from `frontend/` succeeds**)

**Sources of truth, in order:**
1. The bridge code and its README (`bridge/README.md`, `bridge/internal/bridge/server.go`).
2. The teammate's front-end bridge client (`frontend/src/bridge/`, `Workspace.tsx`, `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh`, `docker-compose.yml`).
3. The outer repo's run scripts (`docker-compose.yml`, `template/`).

**Everything the team has pushed is correct by definition; the CLAUDE.md UI changes to match it.**

**Precedence:** where this file and `frontend/CLAUDE.md` disagree, **this file wins**. It replaces CLAUDE.md's protocol section, the same-origin / `/ws` / `/editor/` rules, and the agent parts of the state machine. CLAUDE.md's accessibility, architecture, design and testing rules and its out-of-scope list still apply.

---

## 1. Repository layout

```
VoiceCoder/                      outer repo  github.com/TheAtlantaDream/VoiceCoder
├── docker-compose.yml           include: ./bridge/docker-compose.yml + ./frontend/docker-compose.yml
├── scripts/update_submodules.sh git submodule update --remote; git add frontend bridge
├── template/                    Coder workspace template (main.tf + setup.sh)
├── bridge/   -> submodule       github.com/TheAtlantaDream/VoiceCoder-bridge   (Go: WebSocket, Whisper, cleaning, agent)
└── frontend/ -> submodule       github.com/TheAtlantaDream/VoiceCoder-frontend (React page served by nginx)
```

- **`frontend/` *is* the `voicecoder-frontend` repo.** GitHub repo names are case-insensitive, and the outer repo only stores a pointer to one of its commits. Work on the front end inside `VoiceCoder/frontend/`. A separate standalone clone is not needed (the old `voicecoder-frontend/` clone was folded into `frontend/` and removed).
- **The `.gitmodules` URLs are missing `https://`** (`github.com:TheAtlantaDream/...`), so a plain `git submodule update --init` fails without SSH. Override them locally, as `template/setup.sh` does:
  ```
  git clone https://github.com/TheAtlantaDream/VoiceCoder.git && cd VoiceCoder
  git submodule init
  git config submodule.bridge.url   https://github.com/TheAtlantaDream/VoiceCoder-bridge.git
  git config submodule.frontend.url https://github.com/TheAtlantaDream/VoiceCoder-frontend.git
  git submodule update            # or --remote for each repo's latest main
  ```
  A permanent fix is to change `.gitmodules` to the `https://` URLs (needs the team's OK).
- **Change workflow:**
  1. Commit and push inside `frontend/` (or `bridge/`) first.
  2. Then in the outer repo run `scripts/update_submodules.sh` (or `git add frontend`) and commit/push the new pointer.
  3. Never commit an outer pointer to a submodule commit that isn't pushed.
- Submodules check out as a detached HEAD. Run `git -C frontend checkout main` before committing there.

## 2. Runtime topology

```
Browser (Coder app proxy, HTTPS)
  │
  ├─ frontend page (nginx :80) ──── /vscode/ ──► openvscode-server :3000   (compose mode)
  │        │  config.js: DEFAULT_BRIDGE_URL, TARGET_SAMPLE_RATE, VSCODE_WEB_URL
  │        ▼
  └─ WebSocket ws://<host>:8000/ws ──► bridge (Go)
                                         ├─ POST /inference ──► whisper.cpp server :8080 (16 kHz WAV, model small.en)
                                         └─ agent (--agent): agentapi :3284 ─► claude (in ~/project)
                                                               or `claude -p` directly, or fake
```

| Port | Service | Notes |
| --- | --- | --- |
| 80 | frontend (nginx) | `frontend/docker-compose.yml` maps `80:80` (changed from 8080 in `10e02a5`). The Coder `frontend` app points at `host.docker.internal:80`. |
| 3000 | openvscode-server | Proxied by nginx at `/vscode/` (same origin). In dev, `vite.config.ts` proxies `/vscode` → `127.0.0.1:3000`. |
| 8000 | bridge | `/ws` (WebSocket), `/health`. |
| 8080 | whisper.cpp | Bridge-internal only. Not the front end. |
| 3284 | AgentAPI | Runs `claude` in `~/project`, with `ANTHROPIC_MODEL=claude-haiku-5-5` (template). |

**Two ways the template runs things** (`template/main.tf` parameter `runtime`):

- **native** (default): `setup.sh` builds and runs Whisper, the bridge and AgentAPI inside the workspace. **The front end is not started in this mode.** The editor is Coder's `code-server` module, opened on `/home/coder/project`.
- **compose**: the workspace runs the outer `docker compose up` on the host Docker. That gives whisper, bridge, the frontend (nginx :80) and openvscode-server. AgentAPI still runs inside the workspace.

### ⚠️ Gaps found in the current wiring (raise with the team)

1. **The bridge is started without an agent in both modes.**
   - In native mode, `setup.sh` runs `voicecoder-bridge -addr :8000 -whisper-url http://localhost:8080` with no `--agent`.
   - In compose mode, `bridge/docker-compose.yml` uses `--addr :8000 --whisper-url http://whisper:8080`.
   - With the default `--agent=none` the bridge only transcribes and cleans: no `agent_result`, and AgentAPI is never called.
   - For native mode, add `--agent=agentapi --repo ~/project`. In compose mode the bridge container can't see `~/project` or reach AgentAPI inside the workspace; it needs a design decision.
2. **The compose editor shows a different folder from the one the agent edits.** openvscode-server mounts a `vscode-workspace` volume at `/home/workspace`, but the agent works in `~/project` in the workspace. The editor won't show the agent's changes until both point at the same folder.
3. **Native mode has no front end.** Only `test-client.html` (the bridge's demo page) can talk to the bridge there.
4. **`DEFAULT_BRIDGE_URL` defaults to `ws://localhost:8000/ws`.**
   - Behind the Coder app proxy the page is `https://…`, and a page served over HTTPS can't open an insecure `ws://` connection, so through Coder it must be a `wss://` URL that reaches port 8000 (for example a Coder port-forward or a `/ws` location in `nginx.conf`).
   - The bridge's `--allowed-origins` (default `http://localhost,http://127.0.0.1,https://coder.c1.workshop.cdr.dev`) must include the page's origin once an agent is set.

## 3. Front-end configuration (runtime, not same-origin)

Read only through `frontend/src/bridge/env.ts`, which checks `window.__VOICECODER__` (from `/config.js`, written by `docker-entrypoint.sh` at container start), then `import.meta.env`, then the default:

| Setting | Default | Notes |
| --- | --- | --- |
| `DEFAULT_BRIDGE_URL` | `ws://localhost:8000/ws` | See gap 4. |
| `TARGET_SAMPLE_RATE` | `16000` | **Must stay 16000.** The bridge writes every chunk as a 16 kHz WAV for Whisper (`internal/whisper/whisper.go`), and its chunk size (64 000 bytes = 2 s) assumes 16 kHz. Any other value garbles transcription. |
| `VSCODE_WEB_URL` | `/vscode/` | The iframe `src`, same origin via nginx. |

Package manager: **bun**. The Dockerfile runs `bun install --frozen-lockfile`, so keep `bun.lock` in sync whenever `package.json` changes. Without bun installed:
```
docker run --rm -v "<frontend dir>":/app -w /app oven/bun:1 bun install --lockfile-only
```
`.gitattributes` keeps `*.sh`, `Dockerfile` and `nginx.conf` LF. Without it, a Windows checkout makes the container die with `set: illegal option -`.

## 4. Bridge protocol (authoritative)

One WebSocket to `DEFAULT_BRIDGE_URL`. Text frames carry JSON; binary frames (client → bridge only) carry audio.

### Client → bridge

| Message | Bridge behaviour |
| --- | --- |
| `{"type":"start"}` | Begin a spoken request. **Resets the utterance buffer, its partials and its sequence numbers, and cancels transcription still running for the previous utterance.** Does **not** cancel a running agent task. |
| *binary* | 16 kHz, 16-bit little-endian, mono PCM. Ignored unless a `start` is active. Any frame size works. |
| `{"type":"end"}` | Finish the spoken request now. A no-op if it has already ended. |
| `{"type":"stop"}` | Stop listening, discard the current utterance, **and cancel a running agent task**. |
| `{"type":"text","text":"…"}` | A typed request: cleaned (wake word stripped), then sent to the agent. No Whisper involved. |

Unknown types get `error "unknown message type X"`. There is **no ping** message.

### Bridge → client

Every message is `{"type", "text"}` plus the listed extra field:

| Type | Extra | Meaning |
| --- | --- | --- |
| `partial` | `seq` | Text of **one ~2 s audio chunk** (not cumulative). `seq` = chunk number, restarting at 0 on each `start`. **Chunks are transcribed concurrently, so they can arrive out of order.** Blank chunks send nothing. |
| `transcript` | | The whole utterance (partials joined in `seq` order). |
| `cleaned` | | The cleaned request: what the agent receives. For `text` requests only `cleaned` is sent (no `transcript`). |
| `status` | | A short sentence to show or read aloud (list below). |
| `agent_result` | `diff` | The task finished. `text` = the agent's plain-language summary (≤ 3 sentences per the workspace rules, meant to be read aloud). `diff` = **all** uncommitted changes in the project folder (omitted when empty). Only sent with an agent set. |
| `error` | | Something failed. `text` is a plain sentence for the user. |

**Status texts** (exact strings, from the bridge README):
- `Working on it.`: a task was sent to the agent.
- `Still working, N seconds so far.`: every 10 s while a task runs.
- `Still working on your last request. Say stop to cancel it.`: a new request arrived during a task and **was dropped**.
- `Stopped. Some files may have changed. Say reject to throw them away, or approve to keep them.`: a running task was stopped.
- `Stopped. Nothing was kept.`: stop arrived with no task running.

**Error texts**, split by where they come from. The protocol has no error code, so the client has to tell them apart by text:

- **Speech / transport:**
  - `I did not hear anything. Try again, a little closer to the mic.` (an utterance with no words; it ends that utterance)
  - `Whisper failed on one chunk, continuing: …` (non-fatal, mid-utterance)
  - `could not read that message, try again`
  - `unknown message type …`
- **Agent (each one ends the task):**
  - `Stopped.`
  - `That took too long, try a smaller request.`
  - `The agent is still busy. Say stop or wait a moment.`
  - `I can't reach the coding agent right now.`
  - `The coding agent did not accept that request.`
  - `The agent finished, but I could not read the changes in the project folder.`
  - `The coding agent ran into a problem and did not finish.`

### Bridge behaviour the client must respect

- **The bridge detects end of speech itself.** A 16-bit RMS ≥ 500 counts as speech. After **1.5 s of silence following speech**, the bridge ends the utterance on its own (and a 200 ms watchdog does the same if audio stops arriving). A client-side countdown is therefore only a **display** of what the bridge will do; sending `end` when it finishes is harmless (idempotent).
- **After an utterance ends, the bridge ignores audio until the next `start`.** For hands-free use the client must send `start` again. **Wait for that utterance's `cleaned` or `error` before sending it**, because `start` wipes the in-flight transcription (§4 `start`).
- **One agent task per connection.** A spoken or typed request during a task is dropped (status "Still working on your last request…"). The exception is a request that is just "stop"/"cancel" (case, spaces and trailing punctuation ignored), which stops the task. **Voice "stop" therefore only works if the client keeps a `start` active while the agent is working.**
- "approve", "reject" and "undo" are ordinary requests that go to the agent. The workspace rules in `~/.claude/CLAUDE.md` define them (commit, discard, revert).
- Closing the WebSocket (for example a page refresh) cancels a running task.
- With an agent set, connections are checked against `--allowed-origins`; a disallowed page gets HTTP 403.

## 5. Current front-end state

- **Default page** (`index.html` → `src/main.tsx` → `App` → `VoiceCoderProvider` + `Workspace`), the teammate's:
  - VS Code iframe (`VSCODE_WEB_URL`) on the left
  - a resizable transcript sidebar: status, Connect / Start talking / End, event log, text prompt
  - auto-connects and starts listening on load
- **It doesn't handle the agent yet.** `src/bridge/types.ts` doesn't parse `agent_result`, so results are logged as raw JSON. There's no `stop` control, and after an utterance ends it doesn't send a new `start` (push-to-talk).
- **Its accessibility issues are kept as lint warnings, not errors:**
  - an inline `style` in `Workspace.tsx`
  - `aria-valuenow` / `aria-valuemin` / `aria-orientation` on a `<button>` (unsupported there; the WAI-ARIA window-splitter pattern uses a focusable `role="separator"`)
  - `EventLog` reads raw partials through `aria-live`
- **The CLAUDE.md UI** (`voicecoder.html` → `src/voicecoder-main.tsx` → `VoiceCoderApp`) is the accessible hands-free UI from `COMPLETED.md`. It only works with fake services (`npm run dev:fake`, then open `/voicecoder.html`). It still speaks the old CLAUDE.md protocol, so it can't talk to the real bridge yet. It isn't in the production build (Vite builds `index.html` only).
- The team chose to keep the teammate's page as the default for now.

## 6. Target client behaviour (hands-free, matching the bridge)

```
open socket ─► start ─► audio… ─► (bridge or client) end ─► partial*… ─► transcript ─► cleaned
                 ▲                                                                       │
                 └──────────── next start (after cleaned / error) ◄──────────────────────┘
with an agent: cleaned ─► status "Working on it." ─► status "Still working…"* ─► agent_result | error
```

- **Mic on (default):** once the socket is open and the mic is granted, send `start` and stream audio. Show the client VAD countdown as a visual cue (`END_OF_SPEECH_MS = 1500`, matching `--silence-secs`). When it ends, send `end` (harmless if the bridge got there first).
- **Live transcript:** keep partials **by `seq`** for the current utterance and show them joined in `seq` order. Ignore partials that arrive after that utterance's `transcript`/`cleaned`. Never in a live region.
- **`cleaned`:** show it as the "Sent to agent" card, then send the next `start` immediately, so the user can keep talking (and say "stop").
- **Agent busy:** starts at status `Working on it.` and ends at `agent_result` or an *agent* error (§4 list). While busy:
  - show `Still working…` statuses visibly (not announced every 10 s)
  - keep listening, so "stop" works
  - handle new requests by the CLAUDE.md queue rule, implemented with the protocol:
    1. when status `Still working on your last request…` follows a `cleaned`, keep that cleaned text as the single **Queued** request
    2. on `agent_result` / agent error, send it as `{"type":"text","text": queued}`
- **`agent_result`:**
  - render `text` as the agent reply (Markdown, raw HTML skipped), and announce "Agent finished" once
  - **don't render `diff`.** CLAUDE.md rules out a diff viewer, and VS Code shows the files. At most, show "Changes waiting for approval: N files" counted from the `diff --git` headers, plus a reminder to say "approve" or "reject".
- **Mic off:**
  - stop audio
  - if no agent task is running, send `stop` (discard the half-spoken utterance)
  - **if a task is running, don't send `stop`** (it would cancel the task); send `end` only if speech was in progress, or nothing
  - mic on again → `start`
- **Reconnect:** a dropped socket cancels the task on the bridge; mark the run failed. After reconnecting, send `start` again if the mic is on. Never replay old audio.
- **Typed prompt:** a secondary, accessible form that sends `text`.

## 7. Required front-end changes (CLAUDE.md UI → real bridge)

Work in `VoiceCoder/frontend/`. Don't delete or rewrite the teammate's files (`src/bridge/*`, `Workspace`, `BridgeStatus`, `EventLog`, `TalkControls`, `TextPrompt`, Docker/nginx files) unless asked. Fixes to them are listed separately, as suggestions.

1. **`src/domain/protocol.ts`**
   - `ClientMsg` = `start | end | stop | text`
   - `ServerMsg` (zod) = `partial{seq,text} | transcript{text} | cleaned{text} | status{text} | agent_result{text, diff?} | error{text}`, with missing `text` → `""` and missing `seq` → `0`
   - remove `mic.*`, `utterance.end`, `ping`, `transcript.*`, `agent.start/text/done` and the structured error
   - delete `wsUrlFrom`
   - add a pure `classifyError(text)` (speech vs agent) and `countDiffFiles(diff)`, with tests
2. **`src/domain/session.ts` (+ tests first, one per transition):**
   - `listening → hearing → pausing` as today
   - `pausing → cleaning`: the countdown ended, **or** `transcript` arrived first (bridge VAD)
   - `cleaning → thinking` on `cleaned` when an agent is present (the next status is `Working on it.`); otherwise `cleaned → listening`. Simplest version: `cleaned → listening`, then `status "Working on it."` creates the run and moves to `thinking`
   - `thinking → responding` is no longer used (the bridge doesn't stream); go `thinking → listening` on `agent_result` / agent error
   - add the queued request (§6), `paused` as today, and connection handling as today
   - runs: `{ runId (client-generated), cleaned, text (summary), diffFiles, status: thinking|done|failed, startedAt, endedAt }`
3. **`src/services/transport/WebSocketTransport.ts`:** build it from `DEFAULT_BRIDGE_URL`; **remove the 15 s ping** (the bridge answers unknown types with an error). Keep the backoff and never buffer audio.
4. **`src/services/audio/MicAudio.ts` / `pcm-worklet.js`:** target 16 000 Hz from `TARGET_SAMPLE_RATE`; keep the worklet, constraints, autoplay and error mapping.
5. **`src/app/SessionProvider.tsx`:** the §6 sequencing:
   - `start` when open, granted and on
   - `end` on countdown
   - the next `start` after `cleaned`/`error`
   - `stop` on mic-off only when not busy
   - queued text resend
   - partials by `seq`
   - action `sendText`
6. **`src/components/EditorFrame.tsx`:** `src = VSCODE_WEB_URL`, `title="Code editor"`. Keep the loading message, the 8 s new-tab fallback and the "Focus voice panel" button.
7. **New `TextPrompt`** (accessible), plus visible bridge status, error announcements, and the agent result card (summary, files-changed count, approve/reject hint as text, no buttons).
8. **`src/services/transport/scripts.ts` + `FakeTransport`:** the new protocol, with partials **out of order**, `transcript`, `cleaned`, `Working on it.`, one `Still working…`, and an `agent_result` with a short summary and a small diff. `VITE_FAKE=1` must demo the whole loop.
9. **Switching the default page** (`index.html`/`main.tsx` → `VoiceCoderApp`) is a **team decision**; for now keep `voicecoder.html` as the entry and update `e2e/` for the new flow.
10. **`CLAUDE.md`:** point its protocol / editor / state-machine sections at this file and change the commands to bun.

**Suggested fixes to the teammate's page** (coordinate first):
- parse `agent_result` in `src/bridge/types.ts`
- send `start` again after `cleaned` for hands-free use
- make the splitter a focusable `role="separator"`
- keep partials out of `aria-live`

## 8. Open questions for the team

1. **Agent wiring:** which `--agent` should native and compose start the bridge with, and how does the compose bridge reach `~/project` and AgentAPI? (gap 1)
2. **Editor folder:** should openvscode-server mount the agent's `~/project`, or should compose use the workspace's `code-server`? (gap 2)
3. **Front end in native mode** (gap 3), and the `wss://` bridge URL plus allowed origins behind the Coder proxy (gap 4).
4. **Structured fields:** could the bridge add a machine-readable field to `status` and `error` (e.g. `code: "agent_busy"`)? The client currently has to match exact English strings.
5. **`.gitmodules`:** switch to `https://` URLs.

## 9. Done means

- In `frontend/`:
  - `bun run test` / `npm test`: 107+ tests, updated for the new protocol
  - `bun run lint` / `npm run lint`: 0 errors
  - `bun run build` passes
  - `npx playwright test` passes
  - `docker build .` passes and the container starts with the right `config.js`
- From the outer repo, `docker compose up --build` brings up whisper, bridge, frontend and vscode-web.
- **Manual check:**
  - run the bridge with `--agent=fake`
  - open the page
  - speak a request and see partial → cleaned → "Working on it." → a `[FAKE AGENT]` result
  - speak again without touching anything
  - say "stop" during a task
- Finally, push `frontend/`, then commit the new submodule pointer in the outer repo.
