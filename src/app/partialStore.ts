/**
 * The live partial transcript changes on every word, so it lives outside the
 * reducer; only LiveTranscript subscribes to it (via useSyncExternalStore).
 */
export interface PartialStore {
  get(): string;
  set(text: string): void;
  subscribe(listener: () => void): () => void;
}

export function createPartialStore(): PartialStore {
  let value = "";
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(text) {
      if (text === value) return;
      value = text;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
