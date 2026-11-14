# COMPLETED — VoiceCoder front end

Work done against `CLAUDE.md` on 2026-11-14, starting from the stock Vite + React + TS template.

## Status at a glance

| Check | Result |
| --- | --- |
| `npm test` (Vitest + Testing Library + vitest-axe) | **107 tests, 18 files, all passing** |
| `npm run lint` (ESLint + `eslint-plugin-jsx-a11y` strict) | clean |
| `npm run build` (`tsc -b` + Vite) | clean |
| `npx playwright test` (Chromium, fake services) | **4/4 passing** |

All six build-order steps from `CLAUDE.md` are implemented. **I did not stop between steps** to show you each one: you asked for the whole of CLAUDE.md in one go. Steps 4–5 (real mic, real WebSocket, real `/editor/`) are implemented and unit-tested, but **have not been run against a real Go bridge**, because none exists in this repo. The manual accessibility passes in step 6 (NVDA, real Windows high-contrast) still need a person; see "Not done" below.

## Commands

```
npm run dev          # real services: needs the Go bridge (dev server proxies /ws and /editor/ to BRIDGE_ORIGIN, default http://localhost:8080)
npm run dev:fake     # VITE_FAKE=1 via .env.fake: the whole UI with no backend
npm run build        # tsc -b && vite build -> dist/
npm test             # vitest run
npm run test:watch   # vitest (watch)
npm run lint         # eslint .
npm run e2e          # playwright test (same as npx playwright test)
```

`npm run dev` with `VITE_FAKE=1` set in the environment also works. `dev:fake` was added because setting an env var inline doesn't work the same way on Windows and Unix.

Optional env: `VITE_WORKSPACE_NAME` sets the workspace name in the header. If it isn't set, the name comes from a Coder path-style URL (`/@user/<workspace>/…`), then from the hostname.

## What was built

### Domain (`src/domain/`): pure TS with no React and no browser APIs
- `protocol.ts`: zod `ServerMsg` discriminated union, the `ClientMsg` type, `parseServerMsg()` (logs and returns `null` for bad JSON or a bad schema, never throws), and `wsUrlFrom(location)` (ws/wss matches http/https, same host).
- `session.ts`: `State`, `Action`, a pure `reducer`, and the selectors `isAgentBusy`, `activeRun`, `speechPhase`. There is one `stage` plus separate `mic` and `connection` status. Runs are stored as `{ runId, requestId, cleaned, text, status, startedAt, endedAt? }`. Time always comes in on the action.
- `config.ts`: `END_OF_SPEECH_MS = 1500` (the only place it's defined) and `EDITOR_LOAD_TIMEOUT_MS = 8000`.
- `vad.ts`: a small pure energy-based voice-activity detector (200 ms onset, 300 ms hang-over). The `END_OF_SPEECH_MS` countdown runs on top of it.
- `status.ts`: `describeStatus(state)` produces the visible status line.
- Tests: `session.test.ts` has one test per transition plus the queueing, connection, mic and robustness cases. `protocol.test.ts` covers parsing, the URL builder and the VAD.

### Services (`src/services/`): each has a real and a fake version
- `transport/Transport.ts`: the interface (`connect`, `close`, `send`, `sendAudio`, `retryNow`, `onMessage`, `onStatus`).
- `transport/WebSocketTransport.ts`: `binaryType = "arraybuffer"`, backoff of 500 ms doubling to a 10 s cap with jitter (50–100% of the delay), a ping every 15 s, and audio/JSON dropped while not open, so old audio is never buffered or replayed. Can reconnect after `close()`, which StrictMode needs. Tested with a mock socket and fake timers.
- `transport/FakeTransport.ts` + `scripts.ts`: replays the email-validator request and a 3-paragraph streamed reply. Playback starts on `mic.start`, waits for the client's `utterance.end`, and drives `FakeAudio` voice events so the session runs the real countdown logic.
- `audio/MicAudio.ts`: checks `isSecureContext`, calls `getUserMedia({ echoCancellation, noiseSuppression })`, creates `AudioContext({ sampleRate: 16000 })` (falling back to the native rate when the browser refuses, as Firefox does; the worklet resamples), loads `public/pcm-worklet.js`, and handles autoplay with `resume()` → `"suspended"`. Error mapping: `NotAllowedError → denied`, `NotFoundError → no_device`, insecure → `insecure_context`. `stop()` stops all tracks, closes the context and cancels a `start()` that's still in flight.
- `audio/FakeAudio.ts`: the fake mic.
- `public/pcm-worklet.js`: Float32 → 16 kHz PCM16 frames of 100 ms (1600 samples), posting `{ pcm, rms }` with the buffer transferred.

### App (`src/app/`): the only code that touches services
- `ServicesContext.tsx`, `contexts.ts`, `hooks.ts` (`useSession`, `useActions`, `useAgentRuns`, `usePartialTranscript`).
- `partialStore.ts`: the live partial transcript lives outside the reducer and is read with `useSyncExternalStore`, so only `LiveTranscript` re-renders on each word.
- `SessionProvider.tsx`: `useReducer` plus effects that each clean up fully:
  transport connect/close · mic start/stop while the mic is wanted · `mic.start`/`mic.stop` whenever the socket is open and the mic is live (so they're re-sent after a reconnect) · `utterance.end` sent whenever the reducer bumps `utteranceSeq` · the end-of-speech countdown timer · autoplay resume on the first `keydown`/`pointerdown` anywhere on the document.

### Components (`src/components/`): one `.tsx` + `.css` + `.test.tsx` each, every test file runs axe
`AppShell` (also holds the always-mounted `role="status"` announcer), `Header`, `MicButton`, `StatusText`, `ActivityPanel` (always-mounted `role="log"` inside a keyboard-scrollable region, auto-scroll only when already at the bottom, otherwise a "New activity ↓" button), `IntroMessage`, `LiveTranscript` (deliberately not a live region), `PauseCountdown` (labelled `<progress>`), `CleanedMessage`, `AgentReply` (react-markdown with `skipHtml`, no `rehype-raw`, images dropped, links open in a new tab and say so, `aria-busy` while streaming), `QueuedRequest`, `ConnectionBanner` (with a "Reconnect now" button), `EditorFrame` ("Loading editor…", then after 8 s an "Open the editor in a new tab" link; a "Focus voice panel" button; a black "VS Code Web" placeholder in fake mode). There is also a shared `Card.css`.

### Styling
- `src/styles/tokens.css` has exactly the tokens from CLAUDE.md, plus spacing, target sizes and `--on-mic: #fff`. `src/styles/base.css` holds the reset, focus ring, `.visually-hidden`, the shared `.button`, and the `prefers-reduced-motion` and `forced-colors` rules.
- Fonts are self-hosted with `@fontsource/*` (IBM Plex Sans/Mono, Abel, Aclonica), so nothing loads from a CDN when the page is behind Coder.
- The focus ring is the accent outline plus a dark halo, so it stays visible on the sage panel. Mic colours are pure CSS (`:hover`, `[aria-pressed="true"]`), and the label and icon (filled vs. crossed out) change too. In forced-colors mode the pressed mic uses `Highlight`/`HighlightText`, and cards get real borders.
- No inline styles anywhere. This is enforced by an ESLint `no-restricted-syntax` rule on JSX `style` attributes.

### Tooling
- `tsconfig.app.json` now has `strict` and `noUncheckedIndexedAccess`. `tsconfig.node.json` also covers `playwright.config.ts` and `e2e/`.
- `vite.config.ts` adds the Vitest config (jsdom, `src/test/setup.ts`) and the dev proxy for `/ws` (with WebSocket support) and `/editor`.
- `eslint.config.js` adds `jsx-a11y` strict, the no-inline-style rule, a scrollable-`region` tabindex exception, and AudioWorklet globals for `public/`.
- `playwright.config.ts` + `e2e/happy-path.spec.ts` cover the full fake flow, keyboard-only navigation, a 640 px viewport (equivalent to 200% zoom) with wrapping panes and no horizontal scroll, and forced colors + reduced motion rendering without errors. Chromium runs with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.

### Removed template files
`src/App.css`, `src/index.css`, `src/assets/*` (hero.png, react.svg, vite.svg), `public/icons.svg`.

## ⚠️ Needs a team decision: protocol addition

CLAUDE.md asks for "ping every 15 s", but the protocol had no ping message, and browsers can't send WebSocket-level pings. I **added `{ type: "ping" }` to `ClientMsg` in `protocol.ts`**, as CLAUDE.md says to do. **The Go bridge owner (#2) needs to know** so the bridge ignores or accepts it. No other message types were invented.

## Interpretations and small deviations (worth reviewing)

1. **React 19, not 18.** The template already shipped React 19.3 with the React Compiler. Nothing here depends on 18-only behaviour, so I kept 19 (which also lets the code use `<Context value>` and `use()`). Downgrading is possible if the team really needs 18.
2. **Initial stage.** `stage` starts at `listening` (the mic is on by default), and a separate `mic` field (`requesting | granted | suspended | denied | no_device | insecure_context | error`) tracks the device. Speech is ignored until `mic === "granted"` and the socket is open.
3. **Queueing.** Speech during `cleaning`/`thinking`/`responding` doesn't change `stage`. It's tracked in `state.queued` (`hearing → pausing → ready`), and only one request is held. On `agent.done`, a `ready` request goes to `cleaning` and `utterance.end` is sent; a half-spoken one continues as `hearing`/`pausing`. The protocol has no "send this text" message, so a queued request is sent by **delaying `utterance.end`** until the agent finishes.
4. **paused → on while the agent is still running** returns to `thinking`/`responding` instead of `listening`, so new speech is still queued and not sent mid-run.
5. **Connection lost** resets `stage` to `listening` (or keeps `paused`), clears pending and queued requests, marks active runs `failed`, and announces "Connection lost" once. Audio isn't sent while closed: `sendAudio` drops frames, and the reducer ignores speech.
6. **Bridge errors** are announced, and an `error` arriving while `cleaning` returns to `listening` so the UI can't get stuck.
7. **Speech detection** comes from a browser-side VAD (energy threshold 0.02 RMS). That threshold is a starting guess and **should be tuned against real microphones**.
8. **`Transport.retryNow()`** was added to the interface for the banner's "Reconnect now" button. This is not a protocol change.
9. **The demo script text** (email validator + 3 paragraphs) is my reconstruction. I didn't have the wireframe prototype, so swap in the exact copy in `scripts.ts` if needed.
10. **Coder path-based URLs.** As specified, `/ws` and `/editor/` are absolute paths. This works with Coder's subdomain app proxy. If the app is ever served under a path prefix (`/@user/ws/apps/voicecoder/`), these need to become relative.

## Errors hit along the way (and fixes)

1. **`npm install eslint-plugin-jsx-a11y` → ERESOLVE.** The latest jsx-a11y (6.10.2) declares peer `eslint ^3–^9`, and the template uses ESLint 10. Fixed with an `overrides` entry in `package.json` (`"eslint-plugin-jsx-a11y": { "eslint": "$eslint" }`). The plugin works fine with ESLint 10 in flat-config mode. Remove the override once jsx-a11y publishes ESLint 10 support.
2. **vitest-axe 0.1 typings** augment the old global `Vi` namespace, which Vitest 5 no longer reads. My first fix, augmenting `Assertion<T>`, failed with TS2428 because Vitest 5 changed it to `Assertion<R, T>`. The working fix augments `Matchers<R, T>` in `src/test/setup.ts`.
3. **`erasableSyntaxOnly`** (from the template tsconfig) forbids TypeScript constructor parameter properties (`constructor(private url: string)`). I rewrote them as explicit fields.
4. **axe + `<iframe>` in jsdom** throws "Respondable target must be a frame in the current window". The EditorFrame axe test runs with `{ iframes: false }`, so it still checks everything around the iframe.
5. **jsdom accessible-name whitespace.** jsdom computed the link name as "docs(opens in a new tab)", without the space a browser keeps, so the test regex allows optional whitespace.
6. **The e2e TypeScript build** failed on `document`/`window` inside `page.evaluate`. Fixed by adding `"DOM"` to `tsconfig.node.json`'s `lib`.
7. (Tooling only) One multi-file shell heredoc write failed on quoting. The files were rewritten with the editor tool, and nothing was lost.

## Not done / next steps

- **Manual accessibility passes** (CLAUDE.md step 6). Still needed: an NVDA + Chrome walk-through (check that "Agent finished" is read once and that the `role="log"` additions aren't read twice), a real Windows high-contrast check, and a real 200% browser zoom. The automated equivalents pass (axe on every component, Playwright keyboard/narrow/forced-colors checks), but they don't replace a person.
- **Real-bridge testing:** the WebSocket, real mic, worklet and `/editor/` iframe against the Go bridge. Run `npm run dev` with the bridge on `:8080`, or set `BRIDGE_ORIGIN`.
- **A real-mic Playwright test** needs a WAV fixture and the bridge (add `--use-file-for-fake-audio-capture=<wav>` in `playwright.config.ts`).
- **Housekeeping:**
  - `bun.lock` from the template is now stale. I used npm (bun isn't installed), so `package-lock.json` is the real lockfile. Delete `bun.lock` or regenerate it, whichever the team prefers.
  - `README.md` is still the Vite template boilerplate.
  - `npm install` reports some audit advisories in dev dependencies. I didn't run `npm audit fix --force` because it can make breaking upgrades.
- Nothing was committed. All changes are in the working tree (`git status` shows them).
