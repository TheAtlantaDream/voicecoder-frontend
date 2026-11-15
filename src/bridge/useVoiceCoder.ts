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
  /** Address of the agent's site while the preview panel is open, else null. */
  previewSrc: string | null
  closePreview: () => void
  connect: () => void
  disconnect: () => void
  setMuted: (muted: boolean) => void
  sendText: (text: string) => void
  /** Cancels the running agent task (sends `stop`). */
  stopTask: () => void
  /** Read the agent's spoken summary aloud (persisted; on by default). */
  readAloud: boolean
  setReadAloud: (on: boolean) => void
  /** True while a spoken summary is playing (mic frames are paused). */
  speaking: boolean
  /** Stops the spoken summary now and resumes the mic. */
  stopSpeaking: () => void
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
