import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { startMicrophone, type MicSession } from './audio.ts'
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

export function VoiceCoderProvider({
  children,
  url = DEFAULT_BRIDGE_URL,
}: VoiceCoderProviderProps) {
  // The React compiler drops the socket effect in this component.
  "use no memo";
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [listening, setListening] = useState(false)
  const [events, setEvents] = useState<LogEntry[]>([])
  const [partial, setPartial] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [cleaned, setCleaned] = useState<string | null>(null)
  const [agentSummary, setAgentSummary] = useState<string | null>(null)
  const [agentDiff, setAgentDiff] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const socketGen = useRef(0)
  const micRef = useRef<MicSession | null>(null)
  const micGen = useRef(0)
  const logId = useRef(0)
  const holdMic = useRef(false)
  const openingMic = useRef(false)

  const push = useCallback((text: string, kind: LogKind) => {
    const id = ++logId.current
    setEvents((current) => [...current, { id, text, kind }])
  }, [])

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const stopMic = useCallback(() => {
    const active = micRef.current
    micGen.current += 1
    if (active) send({ type: 'end' })
    active?.stop()
    micRef.current = null
    setListening(false)
  }, [send])

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
        case 'agent_result':
          setAgentSummary(message.text)
          setAgentDiff(message.diff || null)
          push(`agent: ${message.text}`, 'agent_result')
          if (message.diff) push(message.diff, 'agent_result')
          break
      }
    },
    [push],
  )

  const openSocket = useCallback(() => {
    const generation = ++socketGen.current
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
    }

    socket.onclose = () => {
      if (socketGen.current !== generation) return
      socketRef.current = null
      micGen.current += 1
      micRef.current?.stop()
      micRef.current = null
      setListening(false)
      setStatus('disconnected')
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
  }, [applyMessage, push, url])

  const disconnect = useCallback(() => {
    stopMic()
    socketGen.current += 1
    socketRef.current?.close()
    socketRef.current = null
    setStatus('disconnected')
  }, [stopMic])

  const connect = useCallback(() => {
    stopMic()
    setStatus('connecting')
    openSocket()
  }, [openSocket, stopMic])

  const startTalking = useCallback(async () => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    holdMic.current = false
    const generation = ++micGen.current
    try {
      const session = await startMicrophone((pcm) => {
        const current = socketRef.current
        if (current && current.readyState === WebSocket.OPEN) current.send(pcm)
      })

      if (micGen.current !== generation) {
        session.stop()
        return
      }

      micRef.current = session
      send({ type: 'start' })
      setListening(true)
      push('listening... speak, then press End', 'info')
    } catch (error) {
      if (micGen.current !== generation) return
      const message = error instanceof Error ? error.message : String(error)
      push(`mic error: ${message}`, 'error')
    }
  }, [push, send])

  const stopTalking = useCallback(() => {
    if (!micRef.current) return
    holdMic.current = true
    stopMic()
    push('ended, waiting for transcript...', 'info')
  }, [push, stopMic])

  const sendText = useCallback(
    (text: string) => {
      if (!text) return
      send({ type: 'text', text })
    },
    [send],
  )

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  useEffect(() => {
    openSocket()
    return () => {
      socketGen.current += 1
      micGen.current += 1
      micRef.current?.stop()
      micRef.current = null
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
    }
  }, [openSocket])

  useEffect(() => {
    if (status !== 'connected' || listening || holdMic.current || openingMic.current) return
    openingMic.current = true
    void startTalking().finally(() => {
      openingMic.current = false
    })
  }, [listening, startTalking, status])

  const value = useMemo<VoiceCoderContextValue>(
    () => ({
      url,
      status,
      listening,
      events,
      partial,
      transcript,
      cleaned,
      agentSummary,
      agentDiff,
      connect,
      disconnect,
      startTalking,
      stopTalking,
      sendText,
      clearEvents,
    }),
    [
      url,
      status,
      listening,
      events,
      partial,
      transcript,
      cleaned,
      agentSummary,
      agentDiff,
      connect,
      disconnect,
      startTalking,
      stopTalking,
      sendText,
      clearEvents,
    ],
  )

  return <VoiceCoderContext value={value}>{children}</VoiceCoderContext>
}
