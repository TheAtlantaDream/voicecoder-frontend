import { useState, type FormEvent } from 'react'
import { useVoiceCoder } from '../bridge/index.ts'

export function TextPrompt() {
  const { status, sendText } = useVoiceCoder()
  const [text, setText] = useState('')
  const connected = status === 'connected'

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!connected || !text) return
    sendText(text)
    setText('')
  }

  return (
    <form className="bridge-compose" onSubmit={onSubmit}>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="or type a prompt, e.g. hey VoiceCoder fix the login bug in auth dot py"
        aria-label="Prompt"
      />
      <button type="submit" disabled={!connected || !text}>
        Send as text
      </button>
    </form>
  )
}
