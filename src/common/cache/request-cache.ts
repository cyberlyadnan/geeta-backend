/**
 * Request-scoped deduplication cache.
 * Within one HTTP request, the same key is loaded at most once (concurrent-safe).
 */
export class RequestCache {
  private readonly store = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.store.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const pending = loader();
    this.store.set(key, pending);
    return pending;
  }

  get<T>(key: string): T | undefined {
    const pending = this.store.get(key);
    if (!pending) return undefined;
    // Synchronous peek only when value was already resolved — prefer getOrLoad
    return undefined;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, Promise.resolve(value));
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  size(): number {
    return this.store.size;
  }
}
