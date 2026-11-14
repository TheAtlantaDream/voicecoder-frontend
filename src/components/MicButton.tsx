import "./MicButton.css";

interface Props {
  on: boolean;
  onToggle: () => void;
}

/** Colors come from CSS (:hover, [aria-pressed]); label and icon also change so color is never the only signal. */
export function MicButton({ on, onToggle }: Props) {
  return (
    <button type="button" className="mic-button" aria-pressed={on} onClick={onToggle} data-mic-toggle="">
      <svg className="mic-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {on ? (
          <>
            <rect x="8.5" y="2" width="7" height="12" rx="3.5" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="8.5" y="2" width="7" height="12" rx="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>{on ? "Mic on" : "Mic off"}</span>
    </button>
  );
}
