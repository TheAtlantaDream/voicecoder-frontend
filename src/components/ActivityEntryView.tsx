import type { ActivityEntry, Run } from '../bridge/activity.ts'
import { useNow } from './useNow.ts'
import './ActivityEntryView.css'

const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000))

function RunCard({ run, onStop }: { run: Run; onStop: () => void }) {
  const working = run.status === 'working'
  const now = useNow(working)
  const elapsed = seconds((run.endedAt ?? now) - run.startedAt)

  if (working) {
    return (
      <section className="entry card card--agent" aria-label="Agent" aria-busy="true">
        <div className="card__top">
          <span className="label label--sage">Agent</span>
          <span className="card__time">{elapsed} s</span>
        </div>
        <p className="card__headline">Working on it.</p>
        {run.reply ? (
          <p className="card__text">{run.reply}</p>
        ) : (
          run.progress && <p className="card__soft">{run.progress}</p>
        )}
        <div className="card__actions">
          <button type="button" className="stop" onClick={onStop}>
            <span className="stop__icon" aria-hidden="true" />
            Stop task
          </button>
          <span className="card__soft">or say “stop”</span>
        </div>
      </section>
    )
  }

  if (run.status === 'stopped' || run.status === 'failed') {
    return (
      <section className="entry card card--agent" aria-label="Agent">
        <div className="card__top">
          <span className="label label--sage">Agent</span>
          <span className="card__time">after {elapsed} s</span>
        </div>
        <p className="card__text">
          {run.status === 'stopped' ? 'Stopped. Some files may have changed.' : 'The agent didn’t finish.'}
        </p>
      </section>
    )
  }

  return (
    <section className="entry card card--agent card--result" aria-label="Agent">
      <div className="card__top">
        <span className="label label--sage">Agent</span>
        <span className="card__time">Finished in {elapsed} s</span>
      </div>
      <p className="card__summary">{run.reply}</p>
      {run.diffFiles > 0 && (
        <>
          <hr className="card__divider" />
          <p className="card__files">
            <svg className="card__file-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <span>
              <strong>
                {run.diffFiles === 1 ? '1 file' : `${run.diffFiles} files`} with unapproved changes
              </strong>{' '}
              — open in the editor.
            </span>
          </p>
          <p className="card__hint">Say “approve” to keep these changes, or ask me to undo them.</p>
        </>
      )}
    </section>
  )
}

/** One entry in the activity log. Plain text only; agent text is never rendered as HTML. */
export function ActivityEntryView({ entry, onStop }: { entry: ActivityEntry; onStop: () => void }) {
  switch (entry.kind) {
    case 'intro':
      return (
        <div className="entry intro">
          <h1 className="intro__title">
            Listening.
            <br />
            Say “hey VoiceCoder” to start.
          </h1>
          <p>Then describe the change you want. When you pause, your request is sent automatically.</p>
        </div>
      )
    case 'pausedIntro':
      return (
        <div className="entry intro">
          <h1 className="intro__title">Microphone paused.</h1>
          <p>Nothing is being heard. Turn the mic back on to keep going.</p>
        </div>
      )
    case 'live':
      // Hidden from screen readers so fragments aren't read out; "You said" is announced instead.
      return (
        <div className="entry you" aria-hidden="true">
          <span className="label">You · live</span>
          <p className="you__text">
            {entry.text}
            <span className="you__caret">▍</span>
          </p>
        </div>
      )
    case 'said':
      return (
        <div className="entry you">
          <span className="label">You said</span>
          <p className="you__text">{entry.text}</p>
        </div>
      )
    case 'processing':
      return (
        <div className="entry box box--dashed">
          <svg className="box__ring" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p>Processing what you said. Hold on a moment before you speak again.</p>
        </div>
      )
    case 'sent':
      return (
        <section className="entry card card--sent" aria-label="Sent to agent">
          <span className="label label--sage">Sent to agent</span>
          <p className="card__text">{entry.text}</p>
        </section>
      )
    case 'run':
      return <RunCard run={entry.run} onStop={onStop} />
    case 'notice':
      return (
        <div className="entry box">
          <p className="box__title">{entry.title}</p>
          <p>{entry.detail}</p>
        </div>
      )
    case 'ready':
      return (
        <div className="entry box box--ready">
          <span className="box__dot" aria-hidden="true" />
          <p>Listening for your next request…</p>
        </div>
      )
  }
}
