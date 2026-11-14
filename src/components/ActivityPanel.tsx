import { useEffect, useRef, useState, type ReactNode } from "react";
import "./ActivityPanel.css";

export const ACTIVITY_REGION_ID = "activity-region";

interface Props {
  /** Shown above the log (e.g. ConnectionBanner). */
  banner?: ReactNode;
  /** Log entries. The role="log" container itself is always mounted. */
  children: ReactNode;
  /** Live, non-logged UI below the log: LiveTranscript, PauseCountdown, QueuedRequest. */
  live?: ReactNode;
  /** Changes whenever log content changes; drives auto-scroll. */
  contentVersion: string | number;
}

const BOTTOM_SLACK_PX = 24;

/**
 * Sage activity stream. Auto-scrolls only when the user is already at the
 * bottom; otherwise offers a "New activity" button.
 */
export function ActivityPanel({ banner, children, live, contentVersion }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seenVersion, setSeenVersion] = useState(contentVersion);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [contentVersion, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
    setAtBottom(bottom);
    if (bottom) setSeenVersion(contentVersion);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAtBottom(true);
    setSeenVersion(contentVersion);
  };

  const hasNew = !atBottom && seenVersion !== contentVersion;

  return (
    <section className="activity" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="visually-hidden">
        Activity
      </h2>
      {banner}
      <div
        ref={scrollRef}
        id={ACTIVITY_REGION_ID}
        className="activity__scroll"
        role="region"
        aria-label="Activity stream"
        tabIndex={0}
        onScroll={onScroll}
      >
        <div role="log" aria-label="Requests and agent replies" className="activity__log">
          {children}
        </div>
      </div>
      {hasNew && (
        <button type="button" className="button activity__new" onClick={scrollToBottom}>
          New activity <span aria-hidden="true">↓</span>
        </button>
      )}
      <div className="activity__live">{live}</div>
    </section>
  );
}
