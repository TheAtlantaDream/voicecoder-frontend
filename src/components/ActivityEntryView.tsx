import type { ActivityEntry, Run } from '../bridge/activity.ts'
import { useNow } from './useNow.ts'
import './ActivityEntryView.css'

const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000))

type Actions = {
  onStop: () => void
  /** Set on the latest finished run while its summary is being read aloud. */
  reading?: { onStopReading: () => void }
}

function ReadingAloud({ onStopReading }: { onStopReading: () => void }) {
  return (
    <div className="reading">
      <p className="reading__text">
        <svg className="reading__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M2 7.5h3.5L10 4v12l-4.5-3.5H2z" fill="currentColor" />
          <path d="M13 7a4 4 0 0 1 0 6M15.5 4.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Reading this aloud. Mic paused.
      </p>
      <button type="button" className="btn-ink" onClick={onStopReading}>
        <span className="btn-ink__square" aria-hidden="true" />
        Stop reading
      </button>
    </div>
  )
}

function RunCard({ run, onStop, reading }: { run: Run } & Actions) {
  const working = run.status === 'working'
  const now = useNow(working)
  const elapsed = seconds((run.endedAt ?? now) - run.startedAt)

  if (working) {
    return (
      <section className="entry card" aria-label="Agent" aria-busy="true">
        <div className="entry__top">
          <span className="tag tag--mint">Agent</span>
          <span className="meta">{elapsed} s</span>
        </div>
        <p className="entry__headline">Working on it.</p>
        {run.reply ? (
          <p className="entry__plain">{run.reply}</p>
        ) : (
          run.progress && <p className="entry__soft">{run.progress}</p>
        )}
        <div className="entry__actions">
          <button type="button" className="btn-ink" onClick={onStop}>
            <span className="btn-ink__square" aria-hidden="true" />
            Stop task
          </button>
          <span>or say “stop”</span>
        </div>
      </section>
    )
  }

  if (run.status === 'stopped' || run.status === 'failed') {
    return (
      <section className="entry card" aria-label="Agent">
        <div className="entry__top">
          <span className="tag tag--mint">Agent</span>
          <span className="meta">After {elapsed} s</span>
        </div>
        <p>{run.status === 'stopped' ? 'Stopped. Some files may have changed.' : 'The agent didn’t finish.'}</p>
      </section>
    )
  }

  return (
    <section className="entry card card--result" aria-label="Agent">
      <div className="entry__top">
        <span className="tag tag--mint">Agent</span>
        <span className="meta">Finished in {elapsed} s</span>
      </div>
      <p className="entry__summary">{run.reply}</p>
      {run.diffFiles > 0 && (
        <>
          <p className="entry__files">
            {run.diffFiles === 1 ? '1 file' : `${run.diffFiles} files`} changed by this request
          </p>
          <p>
            Say <strong className="entry__approve">approve</strong> to keep these changes, or ask me to undo them.
          </p>
        </>
      )}
      {reading && <ReadingAloud onStopReading={reading.onStopReading} />}
    </section>
  )
}

/** One entry in the activity log. Plain text only; agent text is never rendered as HTML. */
export function ActivityEntryView({ entry, onStop, reading }: { entry: ActivityEntry } & Actions) {
  switch (entry.kind) {
    case 'intro':
      return (
        <div className="entry intro">
          <h1 className="intro__title">
            <span className="intro__pill">Listening</span> <span className="intro__block">Just Talk</span>
          </h1>
          <p className="intro__text">
            Say “hey VoiceCoder” or “Coder,” then describe the change you want. When you pause, your request is sent.
          </p>
        </div>
      )
    case 'pausedIntro':
      return (
        <div className="entry intro">
          <h1 className="intro__title">
            <span className="intro__pill intro__pill--grey">Mic</span> <span className="intro__block">Paused</span>
          </h1>
          <p className="intro__text">Nothing is being heard. Turn the mic back on to keep going.</p>
        </div>
      )
    case 'live':
      // Hidden from screen readers so fragments aren't read out; "You said" is announced instead.
      return (
        <div className="entry you" aria-hidden="true">
          <span className="tag tag--block">You · live</span>
          <p className="you__text">
            {entry.text}
            <span className="you__caret">▍</span>
          </p>
        </div>
      )
    case 'said':
      return (
        <div className="entry you">
          <span className="tag tag--block">You said</span>
          <p className="you__text">{entry.text}</p>
        </div>
      )
    case 'processing':
      return (
        <div className="entry processing">
          <svg className="processing__ring" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p>Processing what you said. Hold on a moment before you speak again.</p>
        </div>
      )
    case 'sent':
      return (
        <section className="entry sent" aria-label="Sent to agent">
          <span className="tag tag--white">Sent to agent</span>
          <p className="entry__plain">{entry.text}</p>
        </section>
      )
    case 'run':
      return <RunCard run={entry.run} onStop={onStop} reading={reading} />
    case 'notice':
      return (
        <div className="entry card notice">
          <p className="notice__title">{entry.title}</p>
          <p>{entry.detail}</p>
        </div>
      )
    case 'ready':
      return (
        <div className="entry ready">
          <span className="ready__dot" aria-hidden="true" />
          <p>Listening for your next request…</p>
        </div>
      )
  }
}
