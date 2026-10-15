export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly hits: Map<string, number[]> = new Map();

  constructor(max: number = 20, windowMs: number = 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  public check(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Filter out expired timestamps
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length >= this.max) {
      this.hits.set(key, valid);
      return false; // Rate limit exceeded
    }

    valid.push(now);
    this.hits.set(key, valid);
    return true; // Allowed
  }

  public reset(): void {
    this.hits.clear();
  }
}
