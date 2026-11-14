import './bridge.css'
import { BridgeStatus } from './BridgeStatus.tsx'
import { EventLog } from './EventLog.tsx'
import { TalkControls } from './TalkControls.tsx'
import { TextPrompt } from './TextPrompt.tsx'

export function BridgeTest() {
  return (
    <section className="bridge-shell">
      <h1>VoiceCoder bridge</h1>
      <BridgeStatus />
      <TalkControls />
      <TextPrompt />
      <EventLog />
    </section>
  )
}
