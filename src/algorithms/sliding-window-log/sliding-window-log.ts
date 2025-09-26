import * as fs from 'fs';
import type { Redis } from '@upstash/redis';

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

type SlidingWindowLogOptions = {
  windowLimit: number;
  windowMilliseconds: number;
  expiresInMilliseconds: number;
}

class SlidingWindowLog {
  private readonly client: Redis;

  private readonly windowLimit: number;
  private readonly windowMilliseconds: number;
  private readonly expiresInMilliseconds: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: Redis, options: SlidingWindowLogOptions) {
    this.client = client;

    this.windowLimit = options.windowLimit;
    this.windowMilliseconds = options.windowMilliseconds;
    this.expiresInMilliseconds = options.expiresInMilliseconds;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async consume(identifier: string, cost: number): Promise<void> {
    const now = Date.now();

    this.client.evalsha(
      await this.incrementScriptSha,
      [key],
      [
        this.windowLimit,
        this.windowMilliseconds,
        this.expiresInMilliseconds,
        cost,
        now,
      ]
    );

    return {
      key
    }
  }

  public async refund(identifier: string, value: number): Promise<void> {
    // pop latest?
    // await this.client.decrby(currentKey, value);
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(key);
  }
}