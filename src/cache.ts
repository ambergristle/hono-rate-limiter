
type CacheBlockedResult = {
  blocked: boolean;
  resetAt: number;
}

export class MemoryCache {
  private readonly cache: Map<string, number>;

  private readonly maxSize = 1000;

  constructor(cache?: Map<string, number>) {
    this.cache = cache instanceof Map ? cache : new Map();
  }

  get size() {
    return this.cache.size;
  }

  public isBlocked(identifier: string): CacheBlockedResult {
    const resetAt = this.cache.get(identifier);

    if (resetAt === undefined) {
      return {
        blocked: false,
        resetAt: Date.now(),
      };
    }

    if (resetAt < Date.now()) {
      this.cache.delete(identifier);
      return {
        blocked: false,
        resetAt: Date.now(),
      };
    }

    return {
      blocked: true,
      resetAt: resetAt,
    }
  }

  public blockUntil(identifier: string, resetAt: number): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(identifier, resetAt);
  }

  public unblock(identifier: string): void {
    this.cache.delete(identifier);
  }

  public clear(): void {
    this.cache.clear();
  }
}
