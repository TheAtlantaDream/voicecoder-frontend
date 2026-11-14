const FALLBACK_BRIDGE_URL = 'ws://localhost:8000/ws'
const FALLBACK_SAMPLE_RATE = 16_000

type VoiceCoderRuntimeConfig = {
  DEFAULT_BRIDGE_URL?: string
  TARGET_SAMPLE_RATE?: string | number
}

declare global {
  interface Window {
    __VOICECODER__?: VoiceCoderRuntimeConfig
  }
}

function readSetting(name: 'DEFAULT_BRIDGE_URL' | 'TARGET_SAMPLE_RATE'): string | undefined {
  if (typeof window !== 'undefined') {
    const runtime = window.__VOICECODER__?.[name]
    if (runtime != null && String(runtime).trim() !== '') return String(runtime).trim()
  }

  const built =
    name === 'DEFAULT_BRIDGE_URL'
      ? import.meta.env.DEFAULT_BRIDGE_URL
      : import.meta.env.TARGET_SAMPLE_RATE
  if (built != null && built.trim() !== '') return built.trim()
  return undefined
}

export const DEFAULT_BRIDGE_URL = readSetting('DEFAULT_BRIDGE_URL') ?? FALLBACK_BRIDGE_URL

function readSampleRate(): number {
  const raw = readSetting('TARGET_SAMPLE_RATE')
  if (raw == null) return FALLBACK_SAMPLE_RATE
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return FALLBACK_SAMPLE_RATE
  return parsed
}

export const TARGET_SAMPLE_RATE = readSampleRate()
