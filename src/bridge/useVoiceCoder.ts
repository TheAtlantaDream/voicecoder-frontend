import { createContext, useContext } from 'react'
import type { ConnectionStatus, LogEntry } from './types.ts'

export type VoiceCoderContextValue = {
  url: string
  status: ConnectionStatus
  listening: boolean
  muted: boolean
  events: LogEntry[]
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
