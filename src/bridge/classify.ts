// The bridge's status and error messages are plain English with no codes.
// Every comparison against those exact strings lives here and nowhere else.
// Source: bridge/internal/bridge/server.go and bridge/internal/agent/*.go.

export type StatusKind =
  | 'armed'
  | 'wakeReminder'
  | 'working'
  | 'progress'
  | 'busy'
  | 'stoppedWithChanges'
  | 'stoppedNothing'
  | 'unknown'

export type ErrorKind =
  | 'noSpeech'
  | 'chunkFailed'
  | 'badMessage'
  | 'unknownType'
  | 'agentStopped'
  | 'agentTimeout'
  | 'agentBusy'
  | 'agentUnreachable'
  | 'agentRejected'
  | 'agentNoDiff'
  | 'agentFailed'
  | 'other'

const STATUS: Record<string, StatusKind> = {
  'Listening for hey VoiceCoder…': 'armed',
  'Say hey VoiceCoder, hey Coder, or Coder, then your request.': 'wakeReminder',
  'Working on it.': 'working',
  'Still working on your last request. Say stop to cancel it.': 'busy',
  'Stopped. Some files may have changed.': 'stoppedWithChanges',
  'Stopped. Nothing was kept.': 'stoppedNothing',
}

const PROGRESS = /^Still working, (\d+) seconds so far\.$/

export function classifyStatus(text: string): { kind: StatusKind; seconds?: number } {
  const trimmed = text.trim()
  const known = STATUS[trimmed]
  if (known) return { kind: known }
  const progress = PROGRESS.exec(trimmed)
  if (progress) return { kind: 'progress', seconds: Number(progress[1]) }
  return { kind: 'unknown' }
}

const ERRORS: Record<string, ErrorKind> = {
  'I did not hear anything. Try again, a little closer to the mic.': 'noSpeech',
  'could not read that message, try again': 'badMessage',
  'Stopped.': 'agentStopped',
  'That took too long, try a smaller request.': 'agentTimeout',
  'The agent is still busy. Say stop or wait a moment.': 'agentBusy',
  "I can't reach the coding agent right now.": 'agentUnreachable',
  'The coding agent did not accept that request.': 'agentRejected',
  'The agent finished, but I could not read the changes in the project folder.': 'agentNoDiff',
  'The coding agent ran into a problem and did not finish.': 'agentFailed',
}

export function classifyError(text: string): ErrorKind {
  const trimmed = text.trim()
  const known = ERRORS[trimmed]
  if (known) return known
  if (trimmed.startsWith('Whisper failed on one chunk, continuing:')) return 'chunkFailed'
  if (trimmed.startsWith('unknown message type')) return 'unknownType'
  return 'other'
}

/** Errors that end the running agent task. */
export function isAgentError(kind: ErrorKind): boolean {
  return kind.startsWith('agent')
}

/** Number of files in a git diff (one `diff --git` header per file). */
export function countDiffFiles(diff: string | undefined): number {
  if (!diff) return 0
  return diff.split('\n').filter((line) => line.startsWith('diff --git ')).length
}
