
export class BlockedCache {
  private cache: Map<string, number>;

  constructor(cache?: Map<string, number>) {
    this.cache = cache instanceof Map ? cache : new Map();
  }

  public isBlocked(identifier: string) {
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

  public blockUntil(identifier: string, resetAt: number) {
    this.cache.set(identifier, resetAt);
  }

  public unblock(identifier: string) {
    this.cache.delete(identifier);
  }
}
