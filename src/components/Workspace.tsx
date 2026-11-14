import { VSCODE_WEB_URL } from '../bridge/index.ts'
import './bridge.css'
import { BridgeStatus } from './BridgeStatus.tsx'
import { EventLog } from './EventLog.tsx'
import { TalkControls } from './TalkControls.tsx'
import { TextPrompt } from './TextPrompt.tsx'

export function Workspace() {
  return (
    <div className="workspace">
      <iframe
        className="editor-frame"
        title="VS Code"
        src={VSCODE_WEB_URL}
        allow="clipboard-read; clipboard-write"
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
