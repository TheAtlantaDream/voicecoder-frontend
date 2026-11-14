import { useVoiceCoder } from '../bridge/index.ts'

export function BridgeStatus() {
  const { status, listening, muted } = useVoiceCoder()
  const label = muted
    ? 'muted'
    : listening
      ? 'listening for hey VoiceCoder'
      : status === 'connected'
        ? 'connected'
        : status === 'connecting'
          ? 'connecting'
          : 'not connected'

  return (
    <p className="bridge-status">
      Status: <strong>{label}</strong>
    </p>
  )
}
