import { useVoiceCoder } from '../bridge/index.ts'
import './TalkControls.css'

/**
 * The single mic toggle. Colours come from CSS (:hover, [aria-pressed]); the
 * label and icon change too, so colour is never the only signal.
 */
export function TalkControls() {
  const { muted, setMuted } = useVoiceCoder()
  const on = !muted

  return (
    <button type="button" className="mic" aria-pressed={on} onClick={() => setMuted(on)}>
      <svg className="mic__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {on ? (
          <>
            <rect x="5.5" y="1" width="5" height="9" rx="2.5" fill="currentColor" />
            <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="5.5" y="1" width="5" height="9" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>{on ? 'Mic on' : 'Mic off'}</span>
    </button>
  )
}
