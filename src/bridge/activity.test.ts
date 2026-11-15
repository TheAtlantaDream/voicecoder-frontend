import { describe, expect, it } from 'vitest'
import { deriveActivity, type ActivityEntry } from './activity.ts'
import type { ServerMessage, TimedMessage } from './types.ts'

// Messages one second apart, starting at t = 0.
const timed = (...messages: ServerMessage[]): TimedMessage[] =>
  messages.map((message, i) => ({ message, at: i * 1000 }))

const kinds = (entries: ActivityEntry[]) => entries.map((e) => e.kind)

const ARMED: ServerMessage = { type: 'status', text: 'Listening for hey VoiceCoder…' }
const WORKING: ServerMessage = { type: 'status', text: 'Working on it.' }

const utterance: ServerMessage[] = [
  { type: 'partial', seq: 0, text: 'hey VoiceCoder add' },
  { type: 'partial', seq: 1, text: 'a test' },
  { type: 'transcript', text: 'hey VoiceCoder add a test' },
  { type: 'cleaned', text: 'add a test' },
]

describe('deriveActivity', () => {
  it('shows the intro when nothing has happened, or the paused intro when muted', () => {
    expect(kinds(deriveActivity([], { muted: false }).entries)).toEqual(['intro'])
    expect(kinds(deriveActivity(timed(ARMED), { muted: false }).entries)).toEqual(['intro'])
    expect(kinds(deriveActivity([], { muted: true }).entries)).toEqual(['pausedIntro'])
  })

  it('joins live partials in seq order, even when they arrive out of order', () => {
    const { entries, phase } = deriveActivity(
      timed(
        { type: 'partial', seq: 1, text: 'a test' },
        { type: 'partial', seq: 0, text: 'hey VoiceCoder add' },
      ),
      { muted: false },
    )
    expect(phase).toBe('hearing')
    expect(entries).toEqual([{ kind: 'live', key: 'live-0', text: 'hey VoiceCoder add a test' }])
  })

  it('replaces the live entry with "you said" and shows processing until cleaned', () => {
    const { entries, phase } = deriveActivity(timed(...utterance.slice(0, 3)), { muted: false })
    expect(kinds(entries)).toEqual(['said', 'processing'])
    expect(phase).toBe('processing')
  })

  it('shows the cleaned request as sent to the agent', () => {
    const { entries, phase } = deriveActivity(timed(...utterance), { muted: false })
    expect(kinds(entries)).toEqual(['said', 'sent'])
    expect(entries[1]).toMatchObject({ kind: 'sent', text: 'add a test' })
    expect(phase).toBe('idle')
  })

  it('reminds about the wake phrase when speech had none', () => {
    const { entries } = deriveActivity(
      timed(
        { type: 'partial', seq: 0, text: 'add a test' },
        { type: 'transcript', text: 'add a test' },
        { type: 'status', text: 'Say hey VoiceCoder, hey Coder, or Coder, then your request.' },
        ARMED,
      ),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['said', 'notice'])
    expect(entries[1]).toMatchObject({ tone: 'wake' })
  })

  it('tracks a working run with progress and streamed text', () => {
    const working = deriveActivity(
      timed(...utterance, WORKING, { type: 'status', text: 'Still working, 10 seconds so far.' }),
      { muted: false },
    )
    expect(working.phase).toBe('working')
    const run = working.entries.at(-1)
    expect(run).toMatchObject({ kind: 'run', run: { status: 'working', startedAt: 4000, progress: 'Still working, 10 seconds so far.' } })

    const streaming = deriveActivity(
      timed(...utterance, WORKING, { type: 'agent_partial', text: 'I am adding' }),
      { muted: false },
    )
    expect(streaming.entries.at(-1)).toMatchObject({ kind: 'run', run: { reply: 'I am adding' } })
  })

  it('finishes a run with the summary, file count and elapsed time, then shows ready', () => {
    const { entries, phase, finishedRuns } = deriveActivity(
      timed(...utterance, WORKING, {
        type: 'agent_result',
        text: 'I added a test.',
        diff: 'diff --git a/t.py b/t.py\n+x\n',
      }),
      { muted: false },
    )
    expect(phase).toBe('idle')
    expect(finishedRuns).toBe(1)
    expect(kinds(entries)).toEqual(['said', 'sent', 'run', 'ready'])
    expect(entries[2]).toMatchObject({
      kind: 'run',
      run: { status: 'done', reply: 'I added a test.', diffFiles: 1, startedAt: 4000, endedAt: 5000 },
    })
  })

  it('does not show ready while muted', () => {
    const { entries } = deriveActivity(
      timed(...utterance, WORKING, { type: 'agent_result', text: 'Done.', diff: '' }),
      { muted: true },
    )
    expect(kinds(entries)).toEqual(['said', 'sent', 'run'])
  })

  it('marks a stopped run without an extra entry for the trailing "Stopped." error', () => {
    const { entries } = deriveActivity(
      timed(
        ...utterance,
        WORKING,
        { type: 'status', text: 'Stopped. Some files may have changed.' },
        { type: 'error', text: 'Stopped.' },
      ),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['said', 'sent', 'run', 'ready'])
    expect(entries[2]).toMatchObject({ run: { status: 'stopped' } })
  })

  it('fails the run on an agent error and shows the error text', () => {
    const { entries } = deriveActivity(
      timed(...utterance, WORKING, { type: 'error', text: 'That took too long, try a smaller request.' }),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['said', 'sent', 'run', 'notice', 'ready'])
    expect(entries[2]).toMatchObject({ run: { status: 'failed' } })
    expect(entries[3]).toMatchObject({ title: 'That took too long, try a smaller request.' })
  })

  it('shows "no speech" and ends processing', () => {
    const { entries, phase } = deriveActivity(
      timed(
        { type: 'partial', seq: 0, text: '…' },
        { type: 'error', text: 'I did not hear anything. Try again, a little closer to the mic.' },
      ),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['notice'])
    expect(entries[0]).toMatchObject({ tone: 'noSpeech', title: 'I did not hear anything.' })
    expect(phase).toBe('idle')
  })

  it('keeps non-fatal chunk errors and unknown messages out of the log', () => {
    const { entries } = deriveActivity(
      timed(
        { type: 'error', text: 'Whisper failed on one chunk, continuing: boom' },
        { type: 'status', text: 'Stopped. Nothing was kept.' },
      ),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['intro'])
  })

  it('ignores spoken-summary audio messages (they only play sound)', () => {
    const { entries } = deriveActivity(
      timed(...utterance, WORKING, { type: 'agent_result', text: 'Done.', diff: '' }, { type: 'speech', text: 'Done.', audio: '', kind: 'summary' }),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['said', 'sent', 'run', 'ready'])
  })

  it('ignores speech partials while the agent is working', () => {
    const { entries, phase } = deriveActivity(
      timed(
        ...utterance,
        WORKING,
        { type: 'partial', seq: 0, text: 'hey Coder do something else' },
        { type: 'partial', seq: 1, text: 'while busy' },
      ),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['said', 'sent', 'run'])
    expect(phase).toBe('working')
  })

  it('keeps history: earlier requests stay above the current one', () => {
    const second: ServerMessage[] = [
      { type: 'partial', seq: 0, text: 'hey Coder rename it' },
    ]
    const { entries } = deriveActivity(
      timed(...utterance, WORKING, { type: 'agent_result', text: 'Done.', diff: '' }, ...second),
      { muted: false },
    )
    expect(kinds(entries)).toEqual(['said', 'sent', 'run', 'live'])
  })
})
