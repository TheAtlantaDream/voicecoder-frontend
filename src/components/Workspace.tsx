import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { deriveActivity } from '../bridge/activity.ts'
import { useVoiceCoder } from '../bridge/index.ts'
import { BridgeStatus, type Connection } from './BridgeStatus.tsx'
import { ConnectionAlert } from './ConnectionAlert.tsx'
import { EventLog } from './EventLog.tsx'
import './Workspace.css'

const PANEL_KEY = 'voicecoder.panelPercent'
const DEFAULT_PANEL = 36
const MIN_PANEL = 25
const MAX_PANEL = 60
const STEP = 5

const clampPanel = (value: number) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, Math.round(value)))

function readPanelPercent(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_KEY))
    if (Number.isFinite(stored) && stored >= MIN_PANEL && stored <= MAX_PANEL) return stored
  } catch {
    // Storage can be blocked (private mode). Use the default width.
  }
  return DEFAULT_PANEL
}

/**
 * The final layout: header, connection banner, then the activity panel (left),
 * a WAI-ARIA window splitter, and VS Code Web (right).
 */
export function Workspace() {
  const { status, muted, messages, events, editorSrc, stopTask } = useVoiceCoder()
  const mainRef = useRef<HTMLElement>(null)
  const draggingRef = useRef(false)
  const [panel, setPanel] = useState(readPanelPercent)

  // The panel width is a CSS custom property set on the element, not an inline style in JSX.
  useEffect(() => {
    mainRef.current?.style.setProperty('--panel-width', `${panel}%`)
    try {
      localStorage.setItem(PANEL_KEY, String(panel))
    } catch {
      // Keep the width for this session only.
    }
  }, [panel])

  const activity = deriveActivity(messages, { muted })
  const everConnected = events.some((e) => e.kind === 'status' && e.text === 'connected')
  const connection: Connection =
    status === 'connected' ? 'connected' : everConnected ? 'reconnecting' : 'connecting'
  const lastRun = [...activity.entries].reverse().find((e) => e.kind === 'run')
  const announcement =
    activity.finishedRuns > 0 && lastRun?.kind === 'run' && lastRun.run.status !== 'working'
      ? {
          id: activity.finishedRuns,
          text: lastRun.run.status === 'done' ? 'Agent finished' : 'Agent stopped',
        }
      : null

  const resizeTo = (clientX: number) => {
    const bounds = mainRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0) return
    setPanel(clampPanel(((clientX - bounds.left) / bounds.width) * 100))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events can't capture the pointer; moves still resize.
    }
    draggingRef.current = true
    resizeTo(event.clientX)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) resizeTo(event.clientX)
  }

  const stopDragging = () => {
    draggingRef.current = false
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, number> = {
      ArrowLeft: panel - STEP,
      ArrowRight: panel + STEP,
      Home: MIN_PANEL,
      End: MAX_PANEL,
    }
    const value = next[event.key]
    if (value === undefined) return
    event.preventDefault()
    setPanel(clampPanel(value))
  }

  return (
    <div className="page">
      <BridgeStatus phase={activity.phase} muted={muted} connection={connection} announcement={announcement} />
      {connection === 'reconnecting' && <ConnectionAlert />}
      <main ref={mainRef} className="workspace">
        <div className="workspace__panel">
          <EventLog entries={activity.entries} onStop={stopTask} />
        </div>
        {/* A focusable role="separator" is an interactive widget (WAI-ARIA window splitter),
            which jsx-a11y doesn't model. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          className="workspace__splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize transcript panel"
          aria-controls="activity-log"
          aria-valuenow={panel}
          aria-valuemin={MIN_PANEL}
          aria-valuemax={MAX_PANEL}
          aria-valuetext={`Transcript panel ${panel}% of the width`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <span className="workspace__grip" aria-hidden="true" />
        </div>
        <div className="workspace__editor">
          <iframe
            className="workspace__frame"
            title="Code editor"
            src={editorSrc}
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </main>
    </div>
  )
}
