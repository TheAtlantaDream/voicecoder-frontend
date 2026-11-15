# voicecoder-frontend

The front end for [VoiceCoder](https://github.com/TheAtlantaDream/VoiceCoder):
a hands-free coding assistant for developers who can't reliably use a
keyboard or mouse. This repo is a React + TypeScript single page that:

1. Captures the microphone — **on by default**, since clicking a button
   reliably is exactly what the target users can't do.
2. Streams audio to the [Go bridge](https://github.com/TheAtlantaDream/voicecoder-bridge)
   over a WebSocket.
3. Shows the live transcript, the cleaned-up message sent to the coding
   agent, and the agent's streamed text reply (tool calls are never shown).
4. Embeds VS Code Web on the right in an iframe at `/vscode/`.

The other parts of the stack — the Coder workspace template, the speech
server, the Go bridge, and the coding agent — live in the
[VoiceCoder](https://github.com/TheAtlantaDream/VoiceCoder) and
[voicecoder-bridge](https://github.com/TheAtlantaDream/voicecoder-bridge)
repos.

## Stack

React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vite. `zod`
validates every message from the network. `react-markdown` (no
`rehype-raw`) renders agent text. Vitest + Testing Library + `vitest-axe`
for unit/component tests, Playwright for end-to-end. Plain CSS with custom
properties — no CSS framework, no component library.

## Getting started

Requires Node.js (or [Bun](https://bun.sh), which the Docker image uses) and
npm.

```
npm install
npm run dev
```

By default the dev server proxies `/ws` to a bridge at `http://127.0.0.1:8000`
and `/vscode` to `http://127.0.0.1:3000` (see `vite.config.ts`), so a real
bridge and VS Code Web instance need to be running alongside it — see the
[VoiceCoder](https://github.com/TheAtlantaDream/VoiceCoder) repo for the
easiest way to start the whole stack with Docker Compose.

### Run without a backend

```
npm run dev:fake
```

Uses `.env.fake` (`VITE_FAKE=1`) to run the full UI against fake
transport/audio services — no bridge, microphone, or VS Code server needed.
This is also what the end-to-end tests run against.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server against a real bridge |
| `npm run dev:fake` | Vite dev server with fake services, no backend needed |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm test` | Vitest unit/component tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint, including `eslint-plugin-jsx-a11y` |
| `npm run e2e` | Playwright end-to-end tests (against the fake services) |

Run `npm test` and `npm run lint` before considering a change done.

## Configuration

At runtime the production build reads `DEFAULT_BRIDGE_URL`,
`TARGET_SAMPLE_RATE`, and `VSCODE_WEB_URL` (see `Dockerfile` /
`docker-entrypoint.sh`, which inline them into `/config.js` when the
container starts). In development, Vite picks up the same names prefixed
with `VITE_`, plus the three unprefixed names via `envPrefix` in
`vite.config.ts`.

## Folder structure

```
src/
  main.tsx                 # composition root: picks real vs fake services (VITE_FAKE)
  App.tsx
  domain/                  # pure TS, no React, no browser APIs
    protocol.ts            # zod schemas for ClientMsg / ServerMsg
    session.ts             # State, Action, reducer
  services/                # side effects behind interfaces; each has a real + fake
    transport/              Transport.ts, WebSocketTransport.ts, FakeTransport.ts
    audio/                  AudioSource.ts, MicAudio.ts, FakeAudio.ts
  app/
    ServicesContext.tsx    # provides services to SessionProvider
    SessionProvider.tsx    # useReducer + effects that connect services <-> reducer
    hooks.ts               # useSession(), useActions(), useAgentRuns() …
  components/              # one .tsx + .css (+ .test.tsx) per component
  styles/tokens.css
public/
  pcm-worklet.js           # AudioWorklet: Float32 -> 16 kHz PCM16 frames
```

Dependency direction: `components -> app/hooks -> domain`. `services`
import only `domain`. `domain` imports nothing from the app.

## Accessibility

Accessibility is the product, not an afterthought. Every change is expected
to work with keyboard only, a screen reader (NVDA + Chrome), 200% zoom, and
Windows high-contrast mode. Native elements (`<button>`, `<a href>`,
`<dialog>`, `<input>`) are used over ARIA wherever possible.

## Docker

```
docker build -t voicecoder-frontend .
```

Builds the app with Bun and serves the static output through nginx, which
proxies `/ws` to the bridge and `/vscode` to VS Code Web on the same origin.
See `docker-compose.yml` in this repo, or the top-level
[VoiceCoder](https://github.com/TheAtlantaDream/VoiceCoder) repo, to run it
together with the rest of the stack.

## More details

See `CLAUDE.md` for the full design rules, component conventions, and
wireframe reference, and `BRIDGE_INTEGRATION.md` for how this app's bridge
client maps to the bridge's WebSocket protocol.
