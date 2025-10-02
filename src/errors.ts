
export class LimiterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);

    this.name = 'RateLimiterError';
  }
}