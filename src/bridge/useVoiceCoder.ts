import { createContext, useContext } from 'react'
import type { ConnectionStatus, LogEntry, TimedMessage } from './types.ts'

export type VoiceCoderContextValue = {
  url: string
  status: ConnectionStatus
  listening: boolean
  muted: boolean
  events: LogEntry[]
  /** Every parsed bridge message in arrival order, with the time it arrived. */
  messages: TimedMessage[]
  partial: string | null
  transcript: string | null
  cleaned: string | null
  agentSummary: string | null
  agentDiff: string | null
  editorSrc: string
  connect: () => void
  disconnect: () => void
  setMuted: (muted: boolean) => void
  sendText: (text: string) => void
  /** Cancels the running agent task (sends `stop`). */
  stopTask: () => void
  clearEvents: () => void
}

export const VoiceCoderContext = createContext<VoiceCoderContextValue | null>(null)

export function useVoiceCoder(): VoiceCoderContextValue {
  const value = useContext(VoiceCoderContext)
  if (!value) {
    throw new Error('useVoiceCoder must be used within VoiceCoderProvider')
  }
  return value
}
