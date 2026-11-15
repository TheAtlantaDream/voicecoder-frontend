import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { startMicrophone, type MicSession } from './audio.ts'
import { classifyStatus } from './classify.ts'
import { editorDiffSrc, editorFolderSrc } from './editorUrl.ts'
import { DEFAULT_BRIDGE_URL, PREVIEW_URL } from './env.ts'
import {
  parseServerMessage,
  type ClientMessage,
  type ConnectionStatus,
  type LogEntry,
  type LogKind,
  type ServerMessage,
  type SpeechKind,
  type TimedMessage,
} from './types.ts'
import { VoiceCoderContext, type VoiceCoderContextValue } from './useVoiceCoder.ts'

type VoiceCoderProviderProps = {
  children: ReactNode
  url?: string
}

const RECONNECT_MS = 1500

type SpeechClip = { audio: string; kind: SpeechKind }

// Space keeps its normal job while typing, and on a focused button or link
// (keyboard and screen reader users press Space to activate those).
function spaceBelongsTo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.closest('input, textarea, select, button, a[href], summary, [role="button"], [role="switch"], [role="checkbox"], [role="textbox"]') !== null
}

/** localStorage key for the Read aloud toggle. */
export const READ_ALOUD_KEY = 'voicecoder.readAloud'

/** Read aloud is on unless the user turned it off (storage can be blocked). */
function readReadAloudPref(): boolean {
  try {
    return localStorage.getItem(READ_ALOUD_KEY) !== 'false'
  } catch {
    return true
  }
}

export function VoiceCoderProvider({
  children,
  url = DEFAULT_BRIDGE_URL,
}: VoiceCoderProviderProps) {
  // The React compiler drops the socket effect in this component.
  "use no memo";
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [listening, setListening] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [events, setEvents] = useState<LogEntry[]>([])
  const [messages, setMessages] = useState<TimedMessage[]>([])
  const [partial, setPartial] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [cleaned, setCleaned] = useState<string | null>(null)
  const [agentSummary, setAgentSummary] = useState<string | null>(null)
  const [agentDiff, setAgentDiff] = useState<string | null>(null)
  const [editorSrc, setEditorSrc] = useState(editorFolderSrc)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const closePreview = useCallback(() => setPreviewSrc(null), [])
  const [readAloud, setReadAloudState] = useState(readReadAloudPref)
  const [speaking, setSpeaking] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const socketGen = useRef(0)
  const micRef = useRef<MicSession | null>(null)
  const micGen = useRef(0)
  const logId = useRef(0)
  const mutedRef = useRef(false)
  const intentionalClose = useRef(false)
  const openingMic = useRef(false)
  const agentLogId = useRef<number | null>(null)
  // True from "Working on it." until agent_result / stop / failure — hides speech partials.
  const agentBusyRef = useRef(false)
  // Latest openSocket, so the reconnect timer can call it without referencing itself.
  const reconnectRef = useRef<() => void>(() => {})
  const speechRef = useRef<HTMLAudioElement | null>(null)
  const readAloudRef = useRef(readAloud)

  // Clips still waiting behind the one that is playing.
  const speechQueueRef = useRef<SpeechClip[]>([])
  // True while the welcome plays. It says "hey Coder" and "over" itself, so
  // mic audio is not sent during it. During every other clip the mic stays
  // on, so the user can cut in by voice; the bridge is told when a summary
  // plays so it ignores anything but "hey Coder" and "stop".
  const introPlayingRef = useRef(false)

  const tellBridge = useCallback((type: 'speech_start' | 'speech_end') => {
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type }))
  }, [])

  const stopSpeech = useCallback(() => {
    speechQueueRef.current = []
    const audio = speechRef.current
    if (!audio) return
    speechRef.current = null
    introPlayingRef.current = false
    audio.pause()
    setSpeaking(false)
    tellBridge('speech_end')
  }, [tellBridge])

  // Clips play one after another (the welcome, then the summary).
  const playSpeech = useCallback(
    (first: SpeechClip) => {
      // Read aloud off: the text is still shown, just not spoken.
      if (!readAloudRef.current) return
      const start = (clip: SpeechClip) => {
        const audio = new Audio(`data:audio/mpeg;base64,${clip.audio}`)
        const done = () => {
          if (speechRef.current !== audio) return
          const next = speechQueueRef.current.shift()
          if (next !== undefined) return start(next)
          speechRef.current = null
          introPlayingRef.current = false
          setSpeaking(false)
          tellBridge('speech_end')
        }
        audio.onended = done
        audio.onerror = done
        speechRef.current = audio
        introPlayingRef.current = clip.kind === 'intro'
        setSpeaking(true)
        tellBridge(clip.kind === 'summary' ? 'speech_start' : 'speech_end')
        audio.play().catch((error: unknown) => {
          // Never block the flow if playback fails (e.g. autoplay policy).
          console.warn('[voicecoder] could not play speech', error)
          done()
        })
      }
      if (!speechRef.current) return start(first)
      // Narration is only worth hearing live: never let it pile up or delay
      // an answer or the summary.
      if (first.kind === 'narration') return
      if (first.kind !== 'intro') {
        speechQueueRef.current = speechQueueRef.current.filter((clip) => clip.kind !== 'narration')
      }
      speechQueueRef.current.push(first)
    },
    [tellBridge],
  )

  const push = useCallback((text: string, kind: LogKind) => {
    const id = ++logId.current
    setEvents((current) => [...current, { id, text, kind }])
    return id
  }, [])

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const stopMic = useCallback(() => {
    micGen.current += 1
    micRef.current?.stop()
    micRef.current = null
    setListening(false)
  }, [])

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      const at = Date.now()
      if (message.type === 'status') {
        const kind = classifyStatus(message.text).kind
        if (kind === 'working') agentBusyRef.current = true
        if (kind === 'stoppedWithChanges' || kind === 'stoppedNothing') agentBusyRef.current = false
      }
      if (message.type === 'agent_result' || message.type === 'error') {
        agentBusyRef.current = false
      }
      // Drop speech partials (and their log lines) while the agent is working.
      if (message.type === 'partial' && agentBusyRef.current) {
        return
      }
      if (message.type === 'interrupt') {
        stopSpeech()
        return
      }
      if (message.type === 'preview') {
        // A new address each time, so opening again reloads the site.
        setPreviewSrc(message.action === 'open' ? `${PREVIEW_URL}?t=${at}` : null)
        return
      }
      // The activity log doesn't need speech audio (base64 MP3), so don't keep it in memory.
      const logged = message.type === 'speech' ? { ...message, audio: '' } : message
      setMessages((current) => [...current, { message: logged, at }])
      switch (message.type) {
        case 'partial':
          setPartial(message.text)
          push(`partial #${message.seq}: ${message.text}`, 'partial')
          break
        case 'transcript':
          setTranscript(message.text)
          push(`transcript: ${message.text}`, 'transcript')
          break
        case 'cleaned':
          setCleaned(message.text)
          push(`cleaned: ${message.text}`, 'cleaned')
          break
        case 'status':
          push(`status: ${message.text}`, 'status')
          break
        case 'error':
          push(`error: ${message.text}`, 'error')
          break
        case 'agent_partial':
          setAgentSummary(message.text)
          setEvents((current) => {
            if (agentLogId.current != null) {
              return current.map((entry) =>
                entry.id === agentLogId.current
                  ? { ...entry, text: `agent: ${message.text}`, kind: 'agent_partial' }
                  : entry,
              )
            }
            const id = ++logId.current
            agentLogId.current = id
            return [...current, { id, text: `agent: ${message.text}`, kind: 'agent_partial' }]
          })
          break
        case 'agent_result':
          setAgentSummary(message.text)
          setAgentDiff(message.diff || null)
          agentLogId.current = null
          push(`agent: ${message.text}`, 'agent_result')
          if (message.diff) {
            setEditorSrc(editorDiffSrc())
          }
          break
        case 'speech':
          playSpeech({ audio: message.audio, kind: message.kind })
          break
      }
    },
    [playSpeech, push, stopSpeech],
  )

  const ensureMic = useCallback(async () => {
    if (mutedRef.current || micRef.current || openingMic.current) return
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    openingMic.current = true
    const generation = ++micGen.current
    try {
      const session = await startMicrophone((pcm) => {
        if (mutedRef.current || introPlayingRef.current) return
        const current = socketRef.current
        if (current && current.readyState === WebSocket.OPEN) current.send(pcm)
      })

      if (micGen.current !== generation || mutedRef.current) {
        session.stop()
        return
      }

      micRef.current = session
      setListening(true)
      send({ type: 'start' })
    } catch (error) {
      if (micGen.current !== generation) return
      const message = error instanceof Error ? error.message : String(error)
      push(`mic error: ${message}`, 'error')
    } finally {
      openingMic.current = false
    }
  }, [push, send])

  const openSocket = useCallback(() => {
    const generation = ++socketGen.current
    intentionalClose.current = false
    socketRef.current?.close()

    const socket = new WebSocket(url)
    socketRef.current = socket
    queueMicrotask(() => {
      if (socketGen.current !== generation || socket.readyState !== WebSocket.CONNECTING) return
      setStatus('connecting')
    })

    socket.onopen = () => {
      if (socketGen.current !== generation) return
      setStatus('connected')
      push('connected', 'status')
      void ensureMic()
    }

    socket.onclose = () => {
      if (socketGen.current !== generation) return
      socketRef.current = null
      stopMic()
      setStatus('disconnected')
      if (!intentionalClose.current) {
        push('disconnected, reconnecting…', 'status')
        window.setTimeout(() => {
          if (socketGen.current !== generation) return
          reconnectRef.current()
        }, RECONNECT_MS)
      }
    }

    socket.onerror = () => {
      if (socketGen.current !== generation) return
      push(`websocket error: is the bridge running at ${url}?`, 'error')
    }

    socket.onmessage = (event) => {
      if (socketGen.current !== generation) return
      if (typeof event.data !== 'string') {
        push(String(event.data), 'info')
        return
      }

      try {
        const message = parseServerMessage(JSON.parse(event.data))
        if (message) applyMessage(message)
        else push(event.data, 'info')
      } catch {
        push(event.data, 'info')
      }
    }
  }, [applyMessage, ensureMic, push, stopMic, url])

  useEffect(() => {
    reconnectRef.current = openSocket
  }, [openSocket])

  const disconnect = useCallback(() => {
    intentionalClose.current = true
    stopMic()
    socketGen.current += 1
    socketRef.current?.close()
    socketRef.current = null
    setStatus('disconnected')
  }, [stopMic])

  const connect = useCallback(() => {
    intentionalClose.current = false
    stopMic()
    setStatus('connecting')
    openSocket()
  }, [openSocket, stopMic])

  const setMuted = useCallback(
    (next: boolean) => {
      mutedRef.current = next
      setMutedState(next)
      if (next) {
        stopSpeech()
        send({ type: 'stop' })
        stopMic()
        push('muted', 'status')
      } else {
        push('unmuted — listening for hey VoiceCoder…', 'status')
        void ensureMic()
      }
    },
    [ensureMic, push, send, stopMic, stopSpeech],
  )

  const setReadAloud = useCallback(
    (next: boolean) => {
      readAloudRef.current = next
      setReadAloudState(next)
      try {
        localStorage.setItem(READ_ALOUD_KEY, String(next))
      } catch {
        // Storage blocked: keep the choice for this session only.
      }
      if (!next) stopSpeech()
    },
    [stopSpeech],
  )

  const sendText = useCallback(
    (text: string) => {
      if (!text) return
      send({ type: 'text', text })
    },
    [send],
  )

  const stopTask = useCallback(() => {
    send({ type: 'stop' })
  }, [send])

  // Space cancels whatever is happening: the agent working, speech playing,
  // or both. It does nothing when idle, and is left alone while typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (spaceBelongsTo(event.target)) return
      const working = agentBusyRef.current
      if (!speechRef.current && !working) return
      event.preventDefault()
      stopSpeech()
      if (working) {
        send({ type: 'stop' })
        // Stop also ends listening on the bridge; keep the mic armed.
        if (micRef.current && !mutedRef.current) send({ type: 'start' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [send, stopSpeech])

  const clearEvents = useCallback(() => {
    setEvents([])
    setMessages([])
    agentLogId.current = null
  }, [])

  useEffect(() => {
    openSocket()
    return () => {
      intentionalClose.current = true
      socketGen.current += 1
      micGen.current += 1
      micRef.current?.stop()
      micRef.current = null
      speechQueueRef.current = []
      introPlayingRef.current = false
      speechRef.current?.pause()
      speechRef.current = null
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
    }
  }, [openSocket])

  const value = useMemo<VoiceCoderContextValue>(
    () => ({
      url,
      status,
      listening,
      muted,
      events,
      messages,
      partial,
      transcript,
      cleaned,
      agentSummary,
      agentDiff,
      editorSrc,
      previewSrc,
      closePreview,
      connect,
      disconnect,
      setMuted,
      sendText,
      stopTask,
      readAloud,
      setReadAloud,
      speaking,
      stopSpeaking: stopSpeech,
      clearEvents,
    }),
    [
      url,
      status,
      listening,
      muted,
      events,
      messages,
      partial,
      transcript,
      cleaned,
      agentSummary,
      agentDiff,
      editorSrc,
      previewSrc,
      closePreview,
      connect,
      disconnect,
      setMuted,
      sendText,
      stopTask,
      readAloud,
      setReadAloud,
      speaking,
      stopSpeech,
      clearEvents,
    ],
  )

  return <VoiceCoderContext value={value}>{children}</VoiceCoderContext>
}
