import { useVoiceCoder } from '../bridge/index.ts'

export function BridgeStatus() {
  const { status, listening } = useVoiceCoder()
  const label = listening
    ? 'listening'
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
