import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useVoiceCoder } from '../bridge/index.ts'
import './bridge.css'
import { BridgeStatus } from './BridgeStatus.tsx'
import { EventLog } from './EventLog.tsx'
import { TalkControls } from './TalkControls.tsx'
import { TextPrompt } from './TextPrompt.tsx'

const SIDEBAR_KEY = 'voicecoder.sidebarWidth'
const DEFAULT_SIDEBAR = 320
const MIN_SIDEBAR = 220
const MIN_EDITOR = 360

function readSidebarWidth(): number {
  try {
    const parsed = Number(localStorage.getItem(SIDEBAR_KEY))
    if (Number.isFinite(parsed) && parsed >= MIN_SIDEBAR) return parsed
  } catch {
    // Private mode can block storage. Fall back to the default width.
  }
  return DEFAULT_SIDEBAR
}

function clampSidebar(next: number, containerWidth: number): number {
  const max = Math.max(MIN_SIDEBAR, containerWidth - MIN_EDITOR)
  return Math.min(max, Math.max(MIN_SIDEBAR, next))
}

export function Workspace() {
  const { editorSrc } = useVoiceCoder()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(Math.round(sidebarWidth)))
    } catch {
      // Ignore storage failures and keep the width for this session.
    }
  }, [sidebarWidth])

  function resizeTo(clientX: number) {
    const bounds = workspaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    setSidebarWidth(clampSidebar(bounds.right - clientX, bounds.width))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId) === false) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Untrusted events cannot capture the pointer. Moves still update the width.
      }
    }
    resizingRef.current = true
    setResizing(true)
    resizeTo(event.clientX)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!resizingRef.current) return
    resizeTo(event.clientX)
  }

  function stopResizing() {
    resizingRef.current = false
    setResizing(false)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 48 : 16
    const bounds = workspaceRef.current?.getBoundingClientRect()
    const containerWidth = bounds?.width ?? sidebarWidth + MIN_EDITOR
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSidebarWidth((current) => clampSidebar(current + step, containerWidth))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSidebarWidth((current) => clampSidebar(current - step, containerWidth))
    }
  }

  return (
    <div
      ref={workspaceRef}
      className={resizing ? 'workspace is-resizing' : 'workspace'}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <iframe
        className="editor-frame"
        title="VS Code"
        src={editorSrc}
        allow="clipboard-read; clipboard-write"
      />
      <button
        type="button"
        className="workspace-splitter"
        aria-label="Resize editor and transcript"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR}
        aria-valuenow={Math.round(sidebarWidth)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopResizing}
        onPointerCancel={stopResizing}
        onKeyDown={onKeyDown}
      />
      <aside className="transcript-sidebar" aria-label="Voice transcript">
        <h2>Transcript</h2>
        <BridgeStatus />
        <TalkControls />
        <EventLog />
        <TextPrompt />
      </aside>
    </div>
  )
}
