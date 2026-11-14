import Markdown, { type Components } from "react-markdown";
import type { AgentRun, RunStatus } from "../domain/session";
import "./Card.css";
import "./AgentReply.css";

const STATUS_LABEL: Record<RunStatus, string> = {
  thinking: "Thinking…",
  responding: "Responding…",
  done: "Done",
  failed: "Failed",
};

const STATUS_ICON: Record<RunStatus, string> = {
  thinking: "…",
  responding: "…",
  done: "✓",
  failed: "✕",
};

// Links open in a new tab so the voice session is never navigated away.
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  ),
};

/**
 * Agent text only (the bridge filters tool calls). Markdown with raw HTML
 * skipped and images dropped. aria-busy while streaming; the "Agent finished"
 * announcement is made once, by the Announcer, on agent.done.
 */
export function AgentReply({ run }: { run: AgentRun }) {
  const streaming = run.status === "thinking" || run.status === "responding";
  return (
    <section className={`card agent-reply agent-reply--${run.status}`} aria-label="Agent reply" aria-busy={streaming}>
      <h3 className="card__title">
        Agent
        <span className="agent-reply__status">
          <span aria-hidden="true">{STATUS_ICON[run.status]} </span>
          {STATUS_LABEL[run.status]}
        </span>
      </h3>
      {run.text && (
        <div className="agent-reply__body">
          <Markdown skipHtml disallowedElements={["img"]} unwrapDisallowed components={components}>
            {run.text}
          </Markdown>
        </div>
      )}
    </section>
  );
}
