import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActivityEntry } from '../bridge/activity.ts'
import { ActivityEntryView } from './ActivityEntryView.tsx'
import './EventLog.css'

const BOTTOM_SLACK_PX = 24

type Props = {
  entries: ActivityEntry[]
  onStop: () => void
  /** While a summary is read aloud: the Stop reading action for the latest result. */
  onStopReading?: () => void
  /** Pinned below the scrolling log (the typed-request form). */
  footer?: ReactNode
}

/**
 * The activity panel. The role="log" container is always mounted; it only
 * auto-scrolls when the user is already at the bottom.
 */
export function EventLog({ entries, onStop, onStopReading, footer }: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    const el = logRef.current
    if (el && atBottom) el.scrollTop = el.scrollHeight
  }, [entries, atBottom, onStopReading])

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX)
  }

  // The "Reading aloud" row belongs to the most recent finished result.
  let readingKey: string | undefined
  if (onStopReading) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]
      if (e?.kind === 'run' && e.run.status === 'done') {
        readingKey = e.key
        break
      }
    }
  }

  return (
    <section className="activity" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="activity__heading">
        <span className="tag activity__tag">Activity</span>
      </h2>
      <div
        ref={logRef}
        id="activity-log"
        className="activity__log"
        role="log"
        aria-labelledby="activity-heading"
        tabIndex={0}
        onScroll={onScroll}
      >
        {entries.map((entry) => (
          <ActivityEntryView
            key={entry.key}
            entry={entry}
            onStop={onStop}
            reading={entry.key === readingKey && onStopReading ? { onStopReading } : undefined}
          />
        ))}
      </div>
      {footer}
    </section>
  )
}
