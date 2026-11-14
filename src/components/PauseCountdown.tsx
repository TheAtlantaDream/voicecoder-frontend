import { useEffect, useState } from "react";
import "./PauseCountdown.css";

interface Props {
  startedAt: number;
  durationMs: number;
}

const TICK_MS = 100;

/** Shows how long until the paused utterance is sent. A progress bar, not an animation. */
export function PauseCountdown({ startedAt, durationMs }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.min(durationMs, Math.max(0, now - startedAt));
  const seconds = ((durationMs - elapsed) / 1000).toFixed(1);

  return (
    <div className="pause-countdown">
      <label className="pause-countdown__label" htmlFor="pause-countdown-progress">
        Sending in {seconds} s. Keep talking to add more.
      </label>
      <progress id="pause-countdown-progress" className="pause-countdown__bar" max={durationMs} value={elapsed} />
    </div>
  );
}
