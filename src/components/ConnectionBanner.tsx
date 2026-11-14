import "./ConnectionBanner.css";

interface Props {
  retryInMs: number | null;
  onRetry: () => void;
}

/** Shown while the bridge connection is closed. Not a live region: the Announcer says "Connection lost" once. */
export function ConnectionBanner({ retryInMs, onRetry }: Props) {
  const seconds = retryInMs === null ? null : Math.max(1, Math.round(retryInMs / 1000));
  return (
    <section className="connection-banner" aria-label="Connection problem">
      <p className="connection-banner__text">
        <strong>Connection lost.</strong> Your voice isn't being sent right now.
        {seconds !== null && ` Retrying in about ${seconds} s.`}
      </p>
      <button type="button" className="button" onClick={onRetry}>
        Reconnect now
      </button>
    </section>
  );
}
