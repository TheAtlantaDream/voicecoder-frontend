import { useVoiceCoder } from '../bridge/index.ts'

export function TalkControls() {
  const { status, muted, connect, setMuted } = useVoiceCoder()
  const connected = status === 'connected'

  return (
    <div className="bridge-controls">
      {!connected && (
        <button type="button" onClick={connect} disabled={status === 'connecting'}>
          {status === 'connecting' ? 'Connecting…' : 'Reconnect'}
        </button>
      )}
      <button
        type="button"
        className={muted ? 'bridge-start' : 'bridge-stop'}
        onClick={() => setMuted(!muted)}
        disabled={!connected && !muted}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
    </div>
  )
}
