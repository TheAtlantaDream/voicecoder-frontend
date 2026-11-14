import { createContext, useContext } from 'react'
import type { ConnectionStatus, LogEntry } from './types.ts'

export type VoiceCoderContextValue = {
  url: string
  status: ConnectionStatus
  listening: boolean
  events: LogEntry[]
  partial: string | null
  transcript: string | null
  cleaned: string | null
  connect: () => void
  disconnect: () => void
  startTalking: () => Promise<void>
  stopTalking: () => void
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
