import "./Card.css";

/** What the agent actually receives. Plain text, never Markdown/HTML. */
export function CleanedMessage({ text }: { text: string }) {
  return (
    <section className="card card--sent" aria-label="Sent to agent">
      <h3 className="card__title">Sent to agent</h3>
      <p className="card__body">{text}</p>
    </section>
  );
}
