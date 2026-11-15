// Turns the bridge's message stream into the entries the activity panel shows.
// Pure: no React, no clock. Times come from TimedMessage.at.
import { classifyError, classifyStatus, countDiffFiles, isAgentError } from './classify.ts'
import type { TimedMessage } from './types.ts'

export type RunStatus = 'working' | 'done' | 'stopped' | 'failed'

export type Run = {
  status: RunStatus
  startedAt: number
  endedAt?: number
  /** Streamed reply so far, or the final summary. Plain text. */
  reply: string
  /** Latest "Still working, N seconds so far." line, before any reply streams. */
  progress: string | null
  diffFiles: number
}

export type NoticeTone = 'noSpeech' | 'wake' | 'busy' | 'error'

export type ActivityEntry =
  | { kind: 'intro'; key: string }
  | { kind: 'pausedIntro'; key: string }
  | { kind: 'live'; key: string; text: string }
  | { kind: 'said'; key: string; text: string }
  | { kind: 'processing'; key: string }
  | { kind: 'sent'; key: string; text: string }
  | { kind: 'run'; key: string; run: Run }
  | { kind: 'notice'; key: string; tone: NoticeTone; title: string; detail: string }
  | { kind: 'ready'; key: string }

export type Phase = 'idle' | 'hearing' | 'processing' | 'working'

export type Activity = {
  entries: ActivityEntry[]
  phase: Phase
  /** Runs that have ended; the header announces "Agent finished" when it grows. */
  finishedRuns: number
}

const STILL_LISTENING = 'Still listening.'

export function deriveActivity(messages: TimedMessage[], options: { muted: boolean }): Activity {
  const entries: ActivityEntry[] = []
  let partials: Map<number, string> | null = null
  let liveKey = ''
  let processing = false
  let run: Run | null = null
  let finishedRuns = 0

  const endRun = (status: RunStatus, at: number) => {
    if (!run) return
    run.status = status
    run.endedAt = at
    run = null
    finishedRuns++
  }

  messages.forEach(({ message, at }, i) => {
    const key = String(i)
    switch (message.type) {
      case 'partial':
        // Always create the map so tsc sees a Map assignment. Skip storing
        // chunks while a run is active; clear on "Working on it." below.
        if (!partials) {
          partials = new Map()
          liveKey = `live-${i}`
        }
        if (run === null) {
          partials.set(message.seq, message.text)
        }
        break

      case 'transcript':
        partials = null
        entries.push({ kind: 'said', key, text: message.text })
        processing = true
        break

      case 'cleaned':
        processing = false
        entries.push({ kind: 'sent', key, text: message.text })
        break

      case 'status': {
        const status = classifyStatus(message.text)
        if (status.kind === 'working') {
          run = { status: 'working', startedAt: at, reply: '', progress: null, diffFiles: 0 }
          partials = null
          entries.push({ kind: 'run', key, run })
        } else if (status.kind === 'progress') {
          if (run) run.progress = message.text
        } else if (status.kind === 'wakeReminder') {
          processing = false
          entries.push({
            kind: 'notice',
            key,
            tone: 'wake',
            title: 'I didn’t hear the wake phrase.',
            detail: 'Start with “hey VoiceCoder”, “hey Coder” or “Coder”, then your request. Still listening.',
          })
        } else if (status.kind === 'busy') {
          processing = false
          entries.push({
            kind: 'notice',
            key,
            tone: 'busy',
            title: 'Still working on your last request.',
            detail: 'Say “stop” to cancel it.',
          })
        } else if (status.kind === 'stoppedWithChanges') {
          endRun('stopped', at)
        } else if (status.kind === 'unknown') {
          console.info('[activity] unhandled status:', message.text)
        }
        // 'armed' and 'stoppedNothing' only change the header status.
        break
      }

      case 'agent_partial':
        if (run) run.reply = message.text
        break

      case 'agent_result':
        if (run) {
          run.reply = message.text
          run.diffFiles = countDiffFiles(message.diff)
          endRun('done', at)
        }
        break

      case 'error': {
        const kind = classifyError(message.text)
        if (kind === 'chunkFailed' || kind === 'badMessage' || kind === 'unknownType') {
          console.warn('[activity] bridge error:', message.text)
          break
        }
        if (kind === 'agentStopped') {
          // Follows "Stopped. Some files may have changed."; the run is already marked.
          endRun('stopped', at)
          break
        }
        if (isAgentError(kind)) endRun('failed', at)
        processing = false
        if (kind === 'noSpeech') {
          partials = null
          entries.push({
            kind: 'notice',
            key,
            tone: 'noSpeech',
            title: 'I did not hear anything.',
            detail: `Try again, a little closer to the mic. ${STILL_LISTENING}`,
          })
        } else {
          entries.push({ kind: 'notice', key, tone: 'error', title: message.text, detail: STILL_LISTENING })
        }
        break
      }
    }
  })

  // Runs are mutated in place above, so copy them out for React.
  const result: ActivityEntry[] = entries.map((e) => (e.kind === 'run' ? { ...e, run: { ...e.run } } : e))

  // Prefer entry status over the `run` binding — tsc misses endRun's `run = null`
  // and otherwise narrows loop-local `partials` to `never`.
  const activeRun = result.find((e) => e.kind === 'run' && e.run.status === 'working')
  let phase: Phase = activeRun ? 'working' : 'idle'
  const live: Map<number, string> | null = activeRun ? null : (partials as Map<number, string> | null)
  if (live) {
    const text = [...live.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, t]) => t)
      .join(' ')
    result.push({ kind: 'live', key: liveKey, text })
    phase = 'hearing'
  } else if (!activeRun && processing) {
    result.push({ kind: 'processing', key: 'processing' })
    phase = 'processing'
  }

  const last = result.at(-1)
  if (last?.kind === 'run' && last.run.status !== 'working' && !options.muted) {
    result.push({ kind: 'ready', key: 'ready' })
  } else if (last?.kind === 'notice' && last.tone === 'error' && finishedRuns > 0 && !options.muted) {
    const prev = result.at(-2)
    if (prev?.kind === 'run' && prev.run.status === 'failed') result.push({ kind: 'ready', key: 'ready' })
  }

  if (result.length === 0) {
    result.push(options.muted ? { kind: 'pausedIntro', key: 'intro' } : { kind: 'intro', key: 'intro' })
  }

  return { entries: result, phase, finishedRuns }
}
