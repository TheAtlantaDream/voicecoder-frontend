// Composition root for the CLAUDE.md UI (served at /voicecoder.html in dev; not the default page yet).
// The only place that picks real vs fake services (VITE_FAKE).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/abel/400.css";
import "@fontsource/aclonica/400.css";
import "./styles/legacy/tokens.css";
import "./styles/legacy/base.css";
import VoiceCoderApp from "./VoiceCoderApp.tsx";
import type { Services } from "./app/contexts";
import { ServicesProvider } from "./app/ServicesContext";
import { SessionProvider } from "./app/SessionProvider";
import { wsUrlFrom } from "./domain/protocol";
import { FakeAudio } from "./services/audio/FakeAudio";
import { MicAudio } from "./services/audio/MicAudio";
import { FakeTransport } from "./services/transport/FakeTransport";
import { emailValidatorScript } from "./services/transport/scripts";
import { WebSocketTransport } from "./services/transport/WebSocketTransport";

const fake = import.meta.env.VITE_FAKE === "1";

function createServices(): Services {
  if (fake) {
    const audio = new FakeAudio();
    return { audio, transport: new FakeTransport(emailValidatorScript, audio) };
  }
  return { audio: new MicAudio(), transport: new WebSocketTransport(wsUrlFrom(window.location)) };
}

/** VITE_WORKSPACE_NAME, else the workspace from a Coder path-based URL (/@user/workspace...), else the host. */
function workspaceName(): string {
  const fromEnv = import.meta.env.VITE_WORKSPACE_NAME as string | undefined;
  if (fromEnv) return fromEnv;
  const match = /^\/@[^/]+\/([^/.]+)/.exec(window.location.pathname);
  return match?.[1] ?? (fake ? "demo-workspace" : window.location.hostname);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServicesProvider services={createServices()}>
      <SessionProvider>
        <VoiceCoderApp fake={fake} workspace={workspaceName()} />
      </SessionProvider>
    </ServicesProvider>
  </StrictMode>,
);
