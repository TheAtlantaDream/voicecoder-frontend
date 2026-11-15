export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export type LogKind =
  | 'partial'
  | 'transcript'
  | 'cleaned'
  | 'status'
  | 'error'
  | 'info'
  | 'agent_result'
  | 'agent_partial'

export type LogEntry = {
  id: number
  text: string
  kind: LogKind
}

export type PartialMessage = { type: 'partial'; seq: number; text: string }
export type TranscriptMessage = { type: 'transcript'; text: string }
export type CleanedMessage = { type: 'cleaned'; text: string }
export type StatusMessage = { type: 'status'; text: string }
export type ErrorMessage = { type: 'error'; text: string }
export type AgentResultMessage = { type: 'agent_result'; text: string; diff: string }
export type AgentPartialMessage = { type: 'agent_partial'; text: string }
// audio is base64 MP3 of the agent summary, from the bridge's ElevenLabs call.
export type SpeechMessage = { type: 'speech'; text: string; audio: string }

export type ServerMessage =
  | PartialMessage
  | TranscriptMessage
  | CleanedMessage
  | StatusMessage
  | ErrorMessage
  | AgentResultMessage
  | AgentPartialMessage
  | SpeechMessage

/** A bridge message plus when it arrived (ms since epoch). */
export type TimedMessage = { message: ServerMessage; at: number }

export type ClientMessage =
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'stop' }
  | { type: 'text'; text: string }

export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as { type?: unknown; text?: unknown; seq?: unknown; diff?: unknown; audio?: unknown }
  if (typeof message.type !== 'string') return null
  const text = typeof message.text === 'string' ? message.text : ''

  switch (message.type) {
    case 'partial':
      return {
        type: 'partial',
        seq: typeof message.seq === 'number' ? message.seq : 0,
        text,
      }
    case 'transcript':
      return { type: 'transcript', text }
    case 'cleaned':
      return { type: 'cleaned', text }
    case 'status':
      return { type: 'status', text }
    case 'error':
      return { type: 'error', text }
    case 'agent_partial':
      return { type: 'agent_partial', text }
    case 'agent_result':
      return {
        type: 'agent_result',
        text,
        diff: typeof message.diff === 'string' ? message.diff : '',
      }
    case 'speech':
      if (typeof message.audio !== 'string' || !message.audio) return null
      return { type: 'speech', text, audio: message.audio }
    default:
      return null
  }
}
