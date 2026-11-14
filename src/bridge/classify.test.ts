import { describe, expect, it } from 'vitest'
import { classifyError, classifyStatus, countDiffFiles, isAgentError } from './classify.ts'

describe('classifyStatus', () => {
  it.each([
    ['Listening for hey VoiceCoder…', 'armed'],
    ['Say hey VoiceCoder, hey Coder, or Coder, then your request.', 'wakeReminder'],
    ['Working on it.', 'working'],
    ['Still working on your last request. Say stop to cancel it.', 'busy'],
    ['Stopped. Some files may have changed.', 'stoppedWithChanges'],
    ['Stopped. Nothing was kept.', 'stoppedNothing'],
    ['Something new from the bridge', 'unknown'],
  ] as const)('%s -> %s', (text, kind) => {
    expect(classifyStatus(text).kind).toBe(kind)
  })

  it('reads the seconds from progress updates', () => {
    expect(classifyStatus('Still working, 30 seconds so far.')).toEqual({ kind: 'progress', seconds: 30 })
  })

  it('ignores surrounding whitespace', () => {
    expect(classifyStatus('  Working on it.\n').kind).toBe('working')
  })
})

describe('classifyError', () => {
  it.each([
    ['I did not hear anything. Try again, a little closer to the mic.', 'noSpeech'],
    ['Whisper failed on one chunk, continuing: whisper server at http://whisper:8080: timeout', 'chunkFailed'],
    ['could not read that message, try again', 'badMessage'],
    ['unknown message type ping', 'unknownType'],
    ['Stopped.', 'agentStopped'],
    ['That took too long, try a smaller request.', 'agentTimeout'],
    ['The agent is still busy. Say stop or wait a moment.', 'agentBusy'],
    ["I can't reach the coding agent right now.", 'agentUnreachable'],
    ['The coding agent did not accept that request.', 'agentRejected'],
    ['The agent finished, but I could not read the changes in the project folder.', 'agentNoDiff'],
    ['The coding agent ran into a problem and did not finish.', 'agentFailed'],
    ['Something else broke', 'other'],
  ] as const)('%s -> %s', (text, kind) => {
    expect(classifyError(text)).toBe(kind)
  })

  it('knows which errors end an agent task', () => {
    expect(isAgentError('agentTimeout')).toBe(true)
    expect(isAgentError('agentStopped')).toBe(true)
    expect(isAgentError('noSpeech')).toBe(false)
    expect(isAgentError('other')).toBe(false)
  })
})

describe('countDiffFiles', () => {
  it('counts one file per diff --git header', () => {
    const diff = 'diff --git a/a.py b/a.py\n+x\ndiff --git a/b.py b/b.py\n-y\n'
    expect(countDiffFiles(diff)).toBe(2)
  })

  it('is 0 for an empty or missing diff', () => {
    expect(countDiffFiles('')).toBe(0)
    expect(countDiffFiles(undefined)).toBe(0)
  })
})
