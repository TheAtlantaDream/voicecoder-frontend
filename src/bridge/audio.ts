import { TARGET_SAMPLE_RATE } from './types.ts'

export type MicSession = {
  stop: () => void
}

// Downsample mic audio to 16 kHz mono Int16 PCM, matching the bridge frames.
export function downsampleToPcm16(input: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / TARGET_SAMPLE_RATE
  const out = new Int16Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const sample = input[Math.floor(i * ratio)] ?? 0
    const clamped = Math.max(-1, Math.min(1, sample))
    out[i] = clamped * 32767
  }
  return out
}

function pcmBuffer(input: Float32Array, sampleRate: number): ArrayBuffer {
  const pcm = downsampleToPcm16(input, sampleRate)
  const bytes = new ArrayBuffer(pcm.byteLength)
  new Uint8Array(bytes).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength))
  return bytes
}

export async function startMicrophone(onFrame: (pcm: ArrayBuffer) => void): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const audioCtx = new AudioContext()
  await audioCtx.resume()
  const source = audioCtx.createMediaStreamSource(stream)
  const processor = audioCtx.createScriptProcessor(4096, 1, 1)

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    onFrame(pcmBuffer(input, audioCtx.sampleRate))
  }

  const silent = audioCtx.createGain()
  silent.gain.value = 0
  source.connect(processor)
  processor.connect(silent)
  silent.connect(audioCtx.destination)

  return {
    stop() {
      processor.disconnect()
      source.disconnect()
      silent.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void audioCtx.close()
    },
  }
}
