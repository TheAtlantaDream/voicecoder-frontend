import type { Phase } from '../bridge/activity.ts'
import { ReadAloudToggle } from './ReadAloudToggle.tsx'
import { TalkControls } from './TalkControls.tsx'
import './BridgeStatus.css'

export type Connection = 'connected' | 'connecting' | 'reconnecting'

type Props = {
  phase: Phase
  muted: boolean
  speaking: boolean
  connection: Connection
  /** Changes each time a run ends; announced once through the status region. */
  announcement: { id: number; text: string } | null
  workspace?: string
}

function statusText(phase: Phase, muted: boolean, speaking: boolean, connection: Connection): string {
  if (connection !== 'connected') return connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  if (muted) return 'Paused'
  if (speaking) return 'Reading aloud · mic paused'
  if (phase === 'working') return 'Agent working…'
  if (phase === 'processing') return 'Processing · hold on'
  if (phase === 'hearing') return 'Hearing you…'
  return 'Listening'
}

const CONNECTION_TEXT: Record<Connection, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
}

/** The header: brand, mic and read-aloud toggles, live status and connection state. */
export function BridgeStatus({ phase, muted, speaking, connection, announcement, workspace }: Props) {
  return (
    <header className="topbar">
      <p className="topbar__brand">VoiceCoder</p>
      <TalkControls />
      <ReadAloudToggle />
      <p className="topbar__status meta" role="status">
        {statusText(phase, muted, speaking, connection)}
        {announcement && (
          <span key={announcement.id} className="visually-hidden">
            . {announcement.text}
          </span>
        )}
      </p>
      <p className="topbar__connection meta">
        <span
          className={connection === 'connected' ? 'topbar__dot' : 'topbar__dot topbar__dot--ring'}
          aria-hidden="true"
        />
        {CONNECTION_TEXT[connection]}
        {workspace && ` · ${workspace}`}
      </p>
    </header>
  )
}
