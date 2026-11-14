import './ConnectionAlert.css'

/**
 * Shown only while the socket is down after having connected. Mounting it
 * fires the alert, so it is announced once per disconnect.
 */
export function ConnectionAlert() {
  return (
    <div className="connection-alert" role="alert">
      <strong>Lost connection to VoiceCoder.</strong> Reconnecting… Your mic is paused until then.
    </div>
  )
}
