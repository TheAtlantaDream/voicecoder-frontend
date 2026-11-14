import type { Phase } from '../bridge/activity.ts'
import { TalkControls } from './TalkControls.tsx'
import './BridgeStatus.css'

export type Connection = 'connected' | 'connecting' | 'reconnecting'

type Props = {
  phase: Phase
  muted: boolean
  connection: Connection
  /** Changes each time a run ends; announced once through the status region. */
  announcement: { id: number; text: string } | null
  workspace?: string
}

function statusText(phase: Phase, muted: boolean, connection: Connection): string {
  if (connection !== 'connected') return connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  if (muted) return 'Paused'
  if (phase === 'working') return 'Agent working…'
  if (phase === 'processing') return 'Processing — hold on'
  if (phase === 'hearing') return 'Hearing you…'
  return 'Listening for “hey VoiceCoder”'
}

const CONNECTION_TEXT: Record<Connection, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
}

/** The header: brand, mic toggle, live status and connection state. */
export function BridgeStatus({ phase, muted, connection, announcement, workspace }: Props) {
  return (
    <header className="topbar">
      <p className="topbar__brand">VoiceCoder</p>
      <TalkControls />
      <p className="topbar__status" role="status">
        {statusText(phase, muted, connection)}
        {announcement && (
          <span key={announcement.id} className="visually-hidden">
            . {announcement.text}
          </span>
        )}
      </p>
      <p className="topbar__connection">
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
