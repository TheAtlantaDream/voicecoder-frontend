import { VoiceCoderProvider } from './bridge/index.ts'
import { Workspace } from './components/Workspace.tsx'

function App() {
  return (
    <VoiceCoderProvider>
      <Workspace />
    </VoiceCoderProvider>
  )
}

export default App
