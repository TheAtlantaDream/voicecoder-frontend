import "./Card.css";

/** The single request spoken while the agent was busy; sent when it finishes. */
export function QueuedRequest({ text }: { text: string }) {
  return (
    <section className="card" aria-label="Queued request">
      <p className="card__body">
        <strong>Queued:</strong> {text || "your last request"}
      </p>
      <p className="card__note">Sends when the agent finishes.</p>
    </section>
  );
}
