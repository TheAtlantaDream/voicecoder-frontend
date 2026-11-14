import { usePartialTranscript } from "../app/hooks";
import "./LiveTranscript.css";

/**
 * Raw words as they are heard. Deliberately NOT a live region: screen readers
 * would read every fragment. Subscribes to the partial store on its own so the
 * log does not re-render on every word.
 */
export function LiveTranscript({ queued = false }: { queued?: boolean }) {
  const text = usePartialTranscript();
  return (
    <div className="live-transcript">
      <p className="live-transcript__label">{queued ? "Hearing (will be queued)" : "Hearing"}</p>
      <p className="live-transcript__text">{text || "…"}</p>
    </div>
  );
}
