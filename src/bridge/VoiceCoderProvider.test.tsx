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

  it('pauses mic frames while the summary plays and resumes when it ends', async () => {
    await connect()
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(1)

    await act(async () => FakeSocket.last!.receive(SPEECH))
    expect(FakeAudio.all).toHaveLength(1)
    expect(FakeAudio.all[0]!.src).toBe('data:audio/mpeg;base64,AAAA')
    expect(latest.ctx!.speaking).toBe(true)
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(1)

    act(() => FakeAudio.all[0]!.onended!())
    expect(latest.ctx!.speaking).toBe(false)
    act(() => onFrame!(new ArrayBuffer(8)))
    expect(audioFramesSent()).toBe(2)
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
