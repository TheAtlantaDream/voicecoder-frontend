# CLAUDE.md — VoiceCoder front end

## What this is

VoiceCoder lets developers who can't use a keyboard or mouse reliably write code by voice. The user speaks, a Go bridge transcribes and cleans up the speech, Claude Code edits files in a Coder workspace, and the result shows up in VS Code Web.

**This repo is only the front end (team role #4):** a React + TypeScript single page that:

1. Captures the microphone (**on by default**: the target users can't easily click).
2. Streams audio to the Go bridge over a WebSocket.
3. Shows the live transcript, the cleaned-up message sent to the agent, and the agent's streamed **text** reply. Tool calls are never shown.
4. Embeds VS Code Web on the right in an iframe at `/editor/`.

Other team members own the Coder template + Whisper (#1), the Go bridge (#2) and the agent runner (#3). Do not implement their parts here. Talk to them only through the protocol below.

## Hard rules

- **Accessibility is the product.** Every change must work with keyboard only, a screen reader (NVDA + Chrome), 200% zoom and Windows high-contrast mode. If a choice trades accessibility for looks, choose accessibility.
- **Native elements first:** `<button>`, `<a href>`, `<dialog>`, `<input>`. Never put `onClick` on a `div` or `span`. Use ARIA only when no native element works.
- **No inline styles in JSX.** All styling lives in component CSS files and uses the variables in `src/styles/tokens.css`.
- **Components never touch services.** Only `src/app/` talks to the WebSocket, microphone or speech. Components get data and callbacks through props or hooks.
- **The reducer is pure.** No side effects, no `Date.now()`, no I/O inside `reducer()`. Pass time in through the action.
- **Validate everything from the network with zod.** A bad message is logged and ignored, never thrown.
- **Never render agent tool calls**, file contents or raw HTML from the agent. Agent text is rendered as Markdown with raw HTML disabled.
- **Don't add scope** listed under "Out of scope" without being asked.

## Commands

```
npm run dev        # Vite dev server (uses the fake transport when VITE_FAKE=1)
npm run build      # type-check + production build into dist/
npm test           # Vitest (unit + component tests)
npm run lint       # ESLint incl. eslint-plugin-jsx-a11y
npx playwright test  # end-to-end with a fake microphone (once set up)
```

If a script is missing from `package.json`, add it. Run `npm test` and `npm run lint` before declaring any task done.

## Stack

React 18 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vite. `zod` for message validation. `react-markdown` (no `rehype-raw`) for agent text. Vitest + Testing Library + `vitest-axe` for tests, Playwright for end-to-end. Plain CSS with custom properties: no CSS framework, no component library.

## Folder structure

```
src/
  main.tsx                 # composition root: picks real vs fake services (VITE_FAKE)
  App.tsx
  domain/                  # pure TS, no React, no browser APIs
    protocol.ts            # zod schemas for ClientMsg / ServerMsg
    session.ts             # State, Action, reducer
    session.test.ts
  services/                # side effects behind interfaces; each has a real + fake
    transport/Transport.ts, WebSocketTransport.ts, FakeTransport.ts, scripts.ts
    audio/AudioSource.ts, MicAudio.ts, FakeAudio.ts
  app/
    ServicesContext.tsx    # provides services to SessionProvider
    SessionProvider.tsx    # useReducer + effects that connect services <-> reducer
    hooks.ts               # useSession(), useActions(), useAgentRuns() …
  components/              # one .tsx + .css (+ .test.tsx) per component
    AppShell, Header, MicButton, StatusText, ActivityPanel, IntroMessage,
    LiveTranscript, PauseCountdown, CleanedMessage, AgentReply, QueuedRequest,
    ConnectionBanner, EditorFrame
  styles/tokens.css
public/
  pcm-worklet.js           # AudioWorklet: Float32 -> 16 kHz PCM16 frames
```

Dependency direction: `components -> app/hooks -> domain`. `services` import only `domain`. `domain` imports nothing from the app.

## Design (match the "1A · Activity stream — hands-free" wireframe)

Tokens (`src/styles/tokens.css`):

```css
--bg: #1a1a1a; --bg-deep: #141414; --editor: #000;
--sage: #71906e; --on-sage: #0f1a0f; --accent: #98fb98;
--text: #e8e8e8; --text-muted: #a8a8a8; --line: #2e2e2e;
--mic-off: #4a4a4a; --mic-on: #d32f2f; --mic-on-hover: #8b1a1a;
--font-ui: "IBM Plex Sans"; --font-activity: "Abel"; --font-brand: "Aclonica"; --font-mono: "IBM Plex Mono";
```

Layout: a header across the top (brand in Aclonica + sage, mic toggle, status text, workspace name on the right). Below it, two panes that wrap on narrow screens: the activity panel on the left (`flex: 1 1 420px; max-width: 560px`, sage background, Abel 19px, dark text) and the editor on the right (`flex: 999 1 560px`, black).

Color rules:
- `#98fb98` (accent) is used **only** for mic hover and the focus outline. Sage carries the color everywhere else.
- Sage text is allowed only on backgrounds `#141414`–`#1e1e1e`. On a sage background, text is `--on-sage`, never white.
- Abel is never below 16px.

Mic button: `aria-pressed` reflects on/off. Off = gray, hover = accent green with dark text, on = red, on + hover = dark red. All of this is done with CSS (`:hover`, `[aria-pressed="true"]`), not React state. Min 48px tall. The label text ("Mic on" / "Mic off") and the icon (filled vs crossed) change too, so color is never the only signal.

Agent cards and the "Sent to agent" card are dark (`#141414` / `#1a1a1a`) with light text, sitting on the sage panel.

## Session state machine (`domain/session.ts`)

One `stage` at a time. Never model this with separate booleans.

```
listening  -> hearing        (speech detected)
hearing    -> pausing        (silence starts; show countdown)
pausing    -> hearing        (speech resumes before the countdown ends)
pausing    -> cleaning       (countdown ends; utterance sent)
cleaning   -> thinking       (transcript.final received)
thinking   -> responding     (first agent.text)
responding -> listening      (agent.done)
any        -> paused         (user turns mic off)
paused     -> listening      (user turns mic on)
```

Rules:
- The mic starts **on**. Initial stage is `listening` once the mic is granted.
- Speech that arrives while the agent is working (`thinking`/`responding`) is **queued**: one queued request, shown as "Queued: …", sent on `agent.done`.
- The connection status (`connecting | open | closed` + `retryInMs`) is separate from `stage`. While closed, show the `ConnectionBanner` and stop sending audio.
- Agent output is stored per run: `{ runId, cleaned, text, status: "thinking" | "responding" | "done" | "failed", startedAt, endedAt? }`. `agent.text` **appends** `delta` to `text`.
- The pause length that counts as "done talking" is a single config value (`END_OF_SPEECH_MS`, default 1500). Never hard-code it elsewhere.

Every transition gets a unit test in `session.test.ts`. Write the test first.

## Protocol with the Go bridge (`domain/protocol.ts`)

Same origin. The bridge serves `dist/`, the WebSocket at `/ws` and VS Code Web at `/editor/`. Build the WebSocket URL from `location` (`ws:`/`wss:` to match `http:`/`https:`); never hard-code a host.

Client → bridge:
- Binary frames: 16 kHz mono PCM16, ~100 ms each.
- `{ type: "mic.start" }`, `{ type: "mic.stop" }`
- `{ type: "utterance.end" }` (sent when the pause countdown finishes, if the browser runs end-of-speech detection)

Bridge → client:
- `{ type: "transcript.partial", id, text }`: raw live text, may arrive many times
- `{ type: "transcript.final", id, raw, cleaned }`: `cleaned` is what the agent receives
- `{ type: "agent.start", runId }`
- `{ type: "agent.text", runId, delta }`: text only; tool calls are filtered out by the bridge
- `{ type: "agent.done", runId, ok }`
- `{ type: "error", code, message, recoverable }`

If the protocol must change, change `protocol.ts` first, then tell the human so the team can be told. Never silently invent a message type.

## Services

- `Transport`: `connect()`, `close()`, `send(msg)`, `sendAudio(buf)`, `onMessage(cb) → unsubscribe`, `onStatus(cb) → unsubscribe`.
  - `WebSocketTransport`: `binaryType = "arraybuffer"`; reconnect with exponential backoff + jitter (500 ms doubling, cap 10 s); ping every 15 s; never replay old audio after reconnecting.
  - `FakeTransport`: replays a script from `scripts.ts` (same content as the wireframe prototype: an email-validator request and a 3-paragraph reply). The whole UI must be buildable and demoable with `VITE_FAKE=1` and no backend.
- `AudioSource` (`MicAudio`): `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`, `AudioContext({ sampleRate: 16000 })`, `public/pcm-worklet.js`. Check `window.isSecureContext` first. Map errors: `NotAllowedError → "denied"`, `NotFoundError → "no_device"`, insecure → `"insecure_context"`. `stop()` must stop all tracks and close the context.

## Known gotchas — handle these, don't rediscover them

- **React StrictMode runs effects twice in dev.** Every effect that opens a socket, starts the mic or sets a timer must clean up fully, or you'll get duplicate connections.
- **Chrome autoplay policy.** An `AudioContext` created before any user interaction on the page may start `suspended`. On load: call `ctx.resume()`. If it's still suspended, show "Press any key to start listening" and resume on the first `keydown` or `pointerdown` anywhere on the document. Announce it in the status region.
- **Mic needs HTTPS** (or localhost). Through Coder that comes from the app proxy. If `!isSecureContext`, show an explicit message instead of failing silently.
- **Live regions:** mount the `role="status"` announcer and the `role="log"` container once, at startup, never conditionally. Partial transcripts go **outside** the log (in `LiveTranscript`, not a live region) so screen readers don't read fragments. Announce agent replies once, on `agent.done` ("Agent finished"). While streaming, set `aria-busy="true"` on the reply.
- **Scroll:** auto-scroll the log only if the user is already at the bottom. Otherwise show a "New activity ↓" button.
- **Partials re-render a lot.** Keep the live partial transcript in a small separate store (`useSyncExternalStore`) so the whole log doesn't re-render on every word.

## EditorFrame

`<iframe src="/editor/?folder=/home/coder/project" title="Code editor">`. Show "Loading editor…" until `load`. If it hasn't loaded after 8 s, show an "Open the editor in a new tab" link instead. Include a visible "Focus voice panel" control so keyboard and switch users can get back out of the editor. In fake mode, render the black placeholder with a "VS Code Web" label.

## Testing

- Reducer: one test per transition (pure, no DOM).
- Components: Testing Library. **Query by role and accessible name** (`getByRole("button", { name: /mic/i })`). Every component test file also runs `axe` and expects no violations.
- Transport: fake timers for backoff; a bad JSON / bad-schema message must not throw.
- End-to-end (later): Playwright with Chromium flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`.

## Build order (do one step at a time; stop and show the human after each)

1. **Static shell.** Tokens, fonts, `AppShell`, `Header`, `MicButton` (local state), `ActivityPanel` (hard-coded intro), `EditorFrame` placeholder. Matches the wireframe; passes the keyboard/zoom checks.
2. **Domain.** `protocol.ts`, `session.ts` + tests. No UI changes yet.
3. **Fake flow.** `FakeTransport` + `SessionProvider` + hooks. The UI runs the whole wireframe flow (listening → live transcript → countdown → cleaned → agent streaming → listening) from fake messages.
4. **Real mic + WebSocket.** `MicAudio`, worklet, `WebSocketTransport`, autoplay handling, connection banner.
5. **Editor iframe** against the real bridge `/editor/`.
6. **Polish + checks.** NVDA pass, 200% zoom, forced colors, `prefers-reduced-motion`, Playwright happy path.

## Out of scope for the MVP (don't build unless asked)

Login/auth (Coder handles it), a settings page, a setup/onboarding flow, voice commands ("stop", "undo"…), spoken readback (TTS), Keep/Undo buttons, a confirmation dialog, history, multiple themes, any code/diff viewer (VS Code Web does that).

## Definition of done for any component

Keyboard-operable with a visible focus outline · correct role and accessible name · color is never the only signal · targets ≥ 44px (mic ≥ 48px) · works at 200% zoom and in forced colors · announces at most once, at the right politeness · handles every state it can be in · tests + axe pass · no inline styles.
