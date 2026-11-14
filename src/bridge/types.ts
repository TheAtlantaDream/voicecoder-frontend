export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export type LogKind = 'partial' | 'transcript' | 'cleaned' | 'status' | 'error' | 'info'

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

export type ServerMessage =
  | PartialMessage
  | TranscriptMessage
  | CleanedMessage
  | StatusMessage
  | ErrorMessage

export type ClientMessage =
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'text'; text: string }

export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as { type?: unknown; text?: unknown; seq?: unknown }
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
    default:
      return null
  }
}
