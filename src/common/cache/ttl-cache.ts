/** Lightweight in-memory TTL cache for health checks and hot read paths */
export class TtlCache<T> {
  private value: T | undefined;
  private expiresAt = 0;

  constructor(private readonly ttlMs: number) {}

  get cached(): T | undefined {
    if (Date.now() < this.expiresAt && this.value !== undefined) {
      return this.value;
    }
    return undefined;
  }

  async getOrLoad(loader: () => Promise<T>): Promise<T> {
    const hit = this.cached;
    if (hit !== undefined) return hit;

    const value = await loader();
    this.value = value;
    this.expiresAt = Date.now() + this.ttlMs;
    return value;
  }

  invalidate(): void {
    this.value = undefined;
    this.expiresAt = 0;
  }
}
