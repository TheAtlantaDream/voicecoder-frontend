import { VoiceCoderProvider } from './bridge/index.ts'
import { BridgeTest } from './components/BridgeTest.tsx'

function App() {
  return (
    <VoiceCoderProvider>
      <BridgeTest />
    </VoiceCoderProvider>
  )
}

export default App
