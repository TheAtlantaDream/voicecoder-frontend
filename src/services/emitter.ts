/** Minimal typed listener set shared by the services. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(cb: (value: T) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(value: T): void {
    for (const cb of [...this.listeners]) cb(value);
  }
}
