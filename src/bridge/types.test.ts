import { describe, expect, it } from 'vitest'
import { parseServerMessage } from './types'

describe('parseServerMessage speech', () => {
  it('keeps the intro kind and defaults everything else to summary', () => {
    expect(parseServerMessage({ type: 'speech', text: 'hi', audio: 'AAA', kind: 'intro' })).toEqual({
      type: 'speech',
      text: 'hi',
      audio: 'AAA',
      kind: 'intro',
    })
    expect(parseServerMessage({ type: 'speech', text: 'hi', audio: 'AAA' })).toMatchObject({ kind: 'summary' })
    expect(parseServerMessage({ type: 'speech', text: 'hi', audio: 'AAA', kind: 'narration' })).toMatchObject({
      kind: 'narration',
    })
    expect(parseServerMessage({ type: 'speech', text: 'hi', audio: 'AAA', kind: 'reply' })).toMatchObject({ kind: 'reply' })
    expect(parseServerMessage({ type: 'speech', text: 'hi', audio: 'AAA', kind: 'shout' })).toMatchObject({ kind: 'summary' })
  })

  it('drops speech with no audio', () => {
    expect(parseServerMessage({ type: 'speech', text: 'hi' })).toBeNull()
  })

  it('parses interrupt', () => {
    expect(parseServerMessage({ type: 'interrupt' })).toEqual({ type: 'interrupt' })
  })
})
