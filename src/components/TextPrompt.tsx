import { useState, type FormEvent } from 'react'
import { useVoiceCoder } from '../bridge/index.ts'
import './TextPrompt.css'

/**
 * Typed requests, for when speaking isn't practical. Sends the bridge's `text`
 * message, which doesn't need the wake phrase. The mic keeps working alongside it.
 */
export function TextPrompt() {
  const { status, sendText } = useVoiceCoder()
  const [text, setText] = useState('')
  const connected = status === 'connected'

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const request = text.trim()
    if (!connected || !request) return
    sendText(request)
    setText('')
  }

  return (
    <form className="prompt" onSubmit={onSubmit}>
      <label className="prompt__label" htmlFor="prompt-input">
        Or type a request
      </label>
      <div className="prompt__row">
        <input
          id="prompt-input"
          className="prompt__input"
          type="text"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!connected}
          aria-describedby="prompt-hint"
        />
        <button type="submit" className="prompt__send" disabled={!connected}>
          Send
        </button>
      </div>
      <p id="prompt-hint" className="prompt__hint">
        {connected ? 'No wake phrase needed. Press Enter to send.' : 'Typing is available once VoiceCoder reconnects.'}
      </p>
    </form>
  )
}
