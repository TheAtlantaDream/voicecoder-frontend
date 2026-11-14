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
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [listening, setListening] = useState(false)
  const [events, setEvents] = useState<LogEntry[]>([])
  const [partial, setPartial] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [cleaned, setCleaned] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const socketGen = useRef(0)
  const micRef = useRef<MicSession | null>(null)
  const micGen = useRef(0)
  const logId = useRef(0)

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
      }
    },
    [push],
  )

  const disconnect = useCallback(() => {
    stopMic()
    socketGen.current += 1
    socketRef.current?.close()
    socketRef.current = null
    setStatus('disconnected')
  }, [stopMic])

  const connect = useCallback(() => {
    stopMic()
    const generation = ++socketGen.current
    socketRef.current?.close()

    setStatus('connecting')
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      if (socketGen.current !== generation) return
      setStatus('connected')
      push('connected', 'status')
    }

    socket.onclose = () => {
      if (socketGen.current !== generation) return
      socketRef.current = null
      stopMic()
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
  }, [applyMessage, push, stopMic, url])

  const startTalking = useCallback(async () => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

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
    return () => {
      socketGen.current += 1
      micGen.current += 1
      micRef.current?.stop()
      micRef.current = null
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  const value = useMemo<VoiceCoderContextValue>(
    () => ({
      url,
      status,
      listening,
      events,
      partial,
      transcript,
      cleaned,
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
