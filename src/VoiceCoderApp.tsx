import { useActions, useSession } from "./app/hooks";
import { ActivityPanel, ACTIVITY_REGION_ID } from "./components/ActivityPanel";
import { AgentReply } from "./components/AgentReply";
import { AppShell } from "./components/AppShell";
import { CleanedMessage } from "./components/CleanedMessage";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { EditorFrame } from "./components/EditorFrame";
import { Header } from "./components/Header";
import { IntroMessage } from "./components/IntroMessage";
import { LiveTranscript } from "./components/LiveTranscript";
import { PauseCountdown } from "./components/PauseCountdown";
import { QueuedRequest } from "./components/QueuedRequest";
import { END_OF_SPEECH_MS } from "./domain/config";
import { isAgentBusy, speechPhase } from "./domain/session";
import { describeStatus } from "./domain/status";

interface Props {
  fake: boolean;
  workspace: string;
}

function focusVoicePanel() {
  document.getElementById(ACTIVITY_REGION_ID)?.focus();
}

export default function VoiceCoderApp({ fake, workspace }: Props) {
  const state = useSession();
  const actions = useActions();
  const phase = speechPhase(state);
  const queuedSpeech = phase !== null && isAgentBusy(state);
  const lastRun = state.runs.at(-1);
  // One keyed list, so a request keeps its DOM node when its run starts (no re-announcement).
  const entries = [
    ...state.runs.map((run) => ({ key: run.requestId, cleaned: run.cleaned, run })),
    ...(state.sent ? [{ key: state.sent.id, cleaned: state.sent.cleaned, run: undefined }] : []),
  ];
  const contentVersion = `${state.runs.length}:${lastRun?.text.length ?? 0}:${lastRun?.status ?? ""}:${state.sent?.id ?? ""}`;

  const panel = (
    <ActivityPanel
      contentVersion={contentVersion}
      banner={
        state.connection.status === "closed" &&
        state.stage !== "paused" && (
          <ConnectionBanner retryInMs={state.connection.retryInMs} onRetry={actions.retryConnection} />
        )
      }
      live={
        <>
          {phase && <LiveTranscript queued={queuedSpeech} />}
          {phase?.phase === "pausing" && phase.pauseStartedAt !== null && (
            <PauseCountdown key={phase.pauseStartedAt} startedAt={phase.pauseStartedAt} durationMs={END_OF_SPEECH_MS} />
          )}
          {state.queued?.phase === "ready" && <QueuedRequest text={state.queued.text} />}
        </>
      }
    >
      <IntroMessage />
      {entries.map((entry) => (
        <article key={entry.key}>
          {entry.cleaned && <CleanedMessage text={entry.cleaned} />}
          {entry.run && <AgentReply run={entry.run} />}
        </article>
      ))}
    </ActivityPanel>
  );

  return (
    <AppShell
      announcement={state.announcement}
      header={
        <Header
          micOn={state.stage !== "paused"}
          onToggleMic={actions.toggleMic}
          status={describeStatus(state)}
          workspace={workspace}
        />
      }
      panel={panel}
      editor={<EditorFrame fake={fake} onFocusPanel={focusVoicePanel} />}
    />
  );
}
