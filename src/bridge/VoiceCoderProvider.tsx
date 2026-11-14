import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { startMicrophone, type MicSession } from './audio.ts'
import { editorDiffSrc, editorFolderSrc } from './editorUrl.ts'
import { DEFAULT_BRIDGE_URL } from './env.ts'
import {
  parseServerMessage,
  type ClientMessage,
  type ConnectionStatus,
  type LogEntry,
  type LogKind,
  type ServerMessage,
} from './types.ts'
import { VoiceCoderContext, type VoiceCoderContextValue } from './useVoiceCoder.ts'

type VoiceCoderProviderProps = {
  children: ReactNode
  url?: string
}

const RECONNECT_MS = 1500

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
  const [partial, setPartial] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [cleaned, setCleaned] = useState<string | null>(null)
  const [agentSummary, setAgentSummary] = useState<string | null>(null)
  const [agentDiff, setAgentDiff] = useState<string | null>(null)
  const [editorSrc, setEditorSrc] = useState(editorFolderSrc)

  const socketRef = useRef<WebSocket | null>(null)
  const socketGen = useRef(0)
  const micRef = useRef<MicSession | null>(null)
  const micGen = useRef(0)
  const logId = useRef(0)
  const mutedRef = useRef(false)
  const intentionalClose = useRef(false)
  const openingMic = useRef(false)
  const agentLogId = useRef<number | null>(null)

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
      }
    },
    [push],
  )

  const ensureMic = useCallback(async () => {
    if (mutedRef.current || micRef.current || openingMic.current) return
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    openingMic.current = true
    const generation = ++micGen.current
    try {
      const session = await startMicrophone((pcm) => {
        if (mutedRef.current) return
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
          openSocket()
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
        send({ type: 'stop' })
        stopMic()
        push('muted', 'status')
      } else {
        push('unmuted — listening for hey VoiceCoder…', 'status')
        void ensureMic()
      }
    },
    [ensureMic, push, send, stopMic],
  )

  const sendText = useCallback(
    (text: string) => {
      if (!text) return
      send({ type: 'text', text })
    },
    [send],
  )

  const clearEvents = useCallback(() => {
    setEvents([])
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
      partial,
      transcript,
      cleaned,
      agentSummary,
      agentDiff,
      editorSrc,
      connect,
      disconnect,
      setMuted,
      sendText,
      clearEvents,
    }),
    [
      url,
      status,
      listening,
      muted,
      events,
      partial,
      transcript,
      cleaned,
      agentSummary,
      agentDiff,
      editorSrc,
      connect,
      disconnect,
      setMuted,
      sendText,
      clearEvents,
    ],
  )

  return <VoiceCoderContext value={value}>{children}</VoiceCoderContext>
}
