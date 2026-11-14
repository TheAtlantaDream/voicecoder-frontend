import { useEffect, useRef } from 'react'
import { useVoiceCoder } from '../bridge/index.ts'

export function EventLog() {
  const { events } = useVoiceCoder()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [events])

  return (
    <div className="bridge-log" aria-live="polite">
      {events.map((entry) => (
        <p key={entry.id} className={entry.kind}>
          {entry.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  )
}
