import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceCoderProvider, READ_ALOUD_KEY } from './VoiceCoderProvider.tsx'
import { useVoiceCoder, type VoiceCoderContextValue } from './useVoiceCoder.ts'

// ---- fakes: microphone, WebSocket, Audio ----

let onFrame: ((pcm: ArrayBuffer) => void) | null = null
vi.mock('./audio.ts', () => ({
  startMicrophone: vi.fn(async (cb: (pcm: ArrayBuffer) => void) => {
    onFrame = cb
    return { stop: vi.fn() }
  }),
}))

class FakeSocket {
  static OPEN = 1
  static CONNECTING = 0
  static last: FakeSocket | null = null
  readyState = FakeSocket.CONNECTING
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor() {
    FakeSocket.last = this
  }
  send(data: unknown) {
    this.sent.push(data)
  }
  close() {}
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

class FakeAudio {
  static all: FakeAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = false
  src: string
  constructor(src: string) {
    this.src = src
    FakeAudio.all.push(this)
  }
  play() {
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}

const latest: { ctx: VoiceCoderContextValue | null } = { ctx: null }
function Probe() {
  const value = useVoiceCoder()
  useEffect(() => {
    latest.ctx = value
  })
  return null
}

const controlsSent = () =>
  FakeSocket.last!.sent.filter((d) => typeof d === 'string').map((d) => (JSON.parse(d as string) as { type: string }).type)
const audioFramesSent = () => FakeSocket.last!.sent.filter((d) => d instanceof ArrayBuffer).length

async function connect() {
  render(
    <VoiceCoderProvider url="ws://test/ws">
      <Probe />
    </VoiceCoderProvider>,
  )
  await act(async () => {
    FakeSocket.last!.open()
  })
}

const SPEECH = { type: 'speech', text: 'I added a test.', audio: 'AAAA' }

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('Audio', FakeAudio)
  FakeAudio.all = []
  onFrame = null
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('read aloud (provider)', () => {
  it('defaults to on', async () => {
    await connect()
    expect(latest.ctx!.readAloud).toBe(true)
  })

  it('keeps the mic on while the summary plays, and tells the bridge', async () => {
    await connect()
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(1)

    await act(async () => FakeSocket.last!.receive(SPEECH))
    expect(FakeAudio.all).toHaveLength(1)
    expect(FakeAudio.all[0]!.src).toBe('data:audio/mpeg;base64,AAAA')
    expect(latest.ctx!.speaking).toBe(true)
    expect(controlsSent()).toContain('speech_start')
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(2)

    act(() => FakeAudio.all[0]!.onended!())
    expect(latest.ctx!.speaking).toBe(false)
    expect(controlsSent().at(-1)).toBe('speech_end')
  })

  it('does not send the mic while the welcome plays', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive({ ...SPEECH, kind: 'intro' }))
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(0)
    act(() => FakeAudio.all[0]!.onended!())
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(1)
  })

  it('Stop reading ends playback at once and resumes the mic', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive(SPEECH))
    act(() => latest.ctx!.stopSpeaking())
    expect(FakeAudio.all[0]!.paused).toBe(true)
    expect(latest.ctx!.speaking).toBe(false)
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(1)
  })

  it('turning Read aloud off stops playback and is saved', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive(SPEECH))
    act(() => latest.ctx!.setReadAloud(false))
    expect(FakeAudio.all[0]!.paused).toBe(true)
    expect(latest.ctx!.speaking).toBe(false)
    expect(localStorage.getItem(READ_ALOUD_KEY)).toBe('false')
  })

  it('does not play anything when Read aloud is off', async () => {
    localStorage.setItem(READ_ALOUD_KEY, 'false')
    await connect()
    expect(latest.ctx!.readAloud).toBe(false)
    await act(async () => FakeSocket.last!.receive(SPEECH))
    expect(FakeAudio.all).toHaveLength(0)
    expect(latest.ctx!.speaking).toBe(false)
  })

  it('survives localStorage throwing (defaults on, toggling still works)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await connect()
    expect(latest.ctx!.readAloud).toBe(true)
    expect(() => act(() => latest.ctx!.setReadAloud(false))).not.toThrow()
    expect(latest.ctx!.readAloud).toBe(false)
  })
})

describe('speech queue and cutting in (provider)', () => {
  const clip = (kind: string, audio: string) => ({ type: 'speech', text: 'x', audio, kind })
  const srcs = () => FakeAudio.all.map((a) => a.src.split(',')[1])

  it('plays the welcome, then the summary, in order', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive(clip('intro', 'INTRO')))
    await act(async () => FakeSocket.last!.receive(clip('summary', 'SUM')))
    expect(srcs()).toEqual(['INTRO'])
    act(() => FakeAudio.all[0]!.onended!())
    expect(srcs()).toEqual(['INTRO', 'SUM'])
    expect(latest.ctx!.speaking).toBe(true)
  })

  it('drops narration that would have to wait', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive(clip('narration', 'N1')))
    await act(async () => FakeSocket.last!.receive(clip('narration', 'N2')))
    await act(async () => FakeSocket.last!.receive(clip('summary', 'SUM')))
    act(() => FakeAudio.all[0]!.onended!())
    expect(srcs()).toEqual(['N1', 'SUM'])
  })

  it('interrupt from the bridge stops speech and clears the queue', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive(clip('intro', 'INTRO')))
    await act(async () => FakeSocket.last!.receive(clip('summary', 'SUM')))
    await act(async () => FakeSocket.last!.receive({ type: 'interrupt' }))
    expect(FakeAudio.all[0]!.paused).toBe(true)
    expect(latest.ctx!.speaking).toBe(false)
    expect(FakeAudio.all).toHaveLength(1)
  })

  it('preview open and close from the bridge set and clear the preview address', async () => {
    await connect()
    expect(latest.ctx!.previewSrc).toBeNull()
    await act(async () => FakeSocket.last!.receive({ type: 'preview', text: 'open' }))
    expect(latest.ctx!.previewSrc).toMatch(/^\/preview\/\?t=\d+$/)
    await act(async () => FakeSocket.last!.receive({ type: 'preview', text: 'close' }))
    expect(latest.ctx!.previewSrc).toBeNull()
  })

  const space = (target: EventTarget = document.body) => {
    const event = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })
    act(() => {
      target.dispatchEvent(event)
    })
    return event
  }
  const stops = () => controlsSent().filter((t) => t === 'stop').length

  it('space does nothing when idle', async () => {
    await connect()
    expect(space().defaultPrevented).toBe(false)
    expect(stops()).toBe(0)
  })

  it('space stops speech without stopping an idle agent', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive(SPEECH))
    expect(space().defaultPrevented).toBe(true)
    expect(FakeAudio.all[0]!.paused).toBe(true)
    expect(stops()).toBe(0)
  })

  it('space stops a working agent and its narration', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive({ type: 'status', text: 'Working on it.' }))
    await act(async () => FakeSocket.last!.receive(clip('narration', 'N1')))
    expect(space().defaultPrevented).toBe(true)
    expect(FakeAudio.all[0]!.paused).toBe(true)
    expect(stops()).toBe(1)
  })

  it('space is left alone in a text box or on a button, and with modifiers', async () => {
    await connect()
    await act(async () => FakeSocket.last!.receive({ type: 'status', text: 'Working on it.' }))
    for (const tag of ['input', 'textarea', 'button']) {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      expect(space(el).defaultPrevented).toBe(false)
      el.remove()
    }
    const held = new KeyboardEvent('keydown', { code: 'Space', ctrlKey: true, bubbles: true, cancelable: true })
    act(() => {
      document.body.dispatchEvent(held)
    })
    expect(held.defaultPrevented).toBe(false)
    expect(stops()).toBe(0)
  })
})
