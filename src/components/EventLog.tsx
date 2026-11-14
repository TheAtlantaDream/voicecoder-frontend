import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActivityEntry } from '../bridge/activity.ts'
import { ActivityEntryView } from './ActivityEntryView.tsx'
import './EventLog.css'

const BOTTOM_SLACK_PX = 24

type Props = {
  entries: ActivityEntry[]
  onStop: () => void
  /** Pinned below the scrolling log (the typed-request form). */
  footer?: ReactNode
}

/**
 * The sage activity panel. The role="log" container is always mounted; it
 * only auto-scrolls when the user is already at the bottom.
 */
export function EventLog({ entries, onStop, footer }: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    const el = logRef.current
    if (el && atBottom) el.scrollTop = el.scrollHeight
  }, [entries, atBottom])

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX)
  }

  return (
    <section className="activity" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="activity__heading">
        Activity
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
          <ActivityEntryView key={entry.key} entry={entry} onStop={onStop} />
        ))}
      </div>
      {footer}
    </section>
  )
}
