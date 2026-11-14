import { useVoiceCoder } from '../bridge/index.ts'

export function TalkControls() {
  const { status, listening, connect, startTalking, stopTalking } = useVoiceCoder()
  const connected = status === 'connected'

  return (
    <div className="bridge-controls">
      <button type="button" onClick={connect} disabled={status === 'connecting'}>
        Connect
      </button>
      <button
        type="button"
        className="bridge-start"
        onClick={() => void startTalking()}
        disabled={!connected || listening}
      >
        Start talking
      </button>
      <button type="button" className="bridge-stop" onClick={stopTalking} disabled={!listening}>
        End
      </button>
    </div>
  )
}
