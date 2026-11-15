import { useVoiceCoder } from '../bridge/index.ts'
import './ReadAloudToggle.css'

/**
 * Turns the spoken agent summary on/off. aria-pressed carries the state for
 * assistive tech; the On/Off chip and icon show it visually.
 */
export function ReadAloudToggle() {
  const { readAloud, setReadAloud } = useVoiceCoder()

  return (
    <button
      type="button"
      className="read-aloud"
      aria-pressed={readAloud}
      onClick={() => setReadAloud(!readAloud)}
    >
      <svg className="read-aloud__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor" />
        {readAloud ? (
          <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ) : (
          <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
      Read aloud
      <span className={readAloud ? 'read-aloud__chip read-aloud__chip--on' : 'read-aloud__chip'} aria-hidden="true">
        {readAloud ? 'On' : 'Off'}
      </span>
    </button>
  )
}
