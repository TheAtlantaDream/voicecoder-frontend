import { useVoiceCoder } from '../bridge/index.ts'

export function BridgeStatus() {
  const { status } = useVoiceCoder()
  const label =
    status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'not connected'

  return (
    <p className="bridge-status">
      Status: <strong>{label}</strong>
    </p>
  )
}
