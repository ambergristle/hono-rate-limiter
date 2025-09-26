import * as fs from 'fs';
import type { Redis } from '@upstash/redis';

type IncrementArgs = [string, string, string];
type IncrementData = [number, number];

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

const REFUND_SCRIPT = fs.readFileSync('./refund.lua', 'utf8');

type SlidingWindowLogOptions = {
  max: number;
  window: number;
  expiresInMilliseconds: number;
}

export class SlidingWindowLog {
  private readonly client: Redis;

  private readonly max: number;
  private readonly window: number;
  // private readonly expiresInMilliseconds: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: Redis, options: SlidingWindowLogOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;
    // this.expiresInMilliseconds = options.expiresInMilliseconds;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async consume(identifier: string): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    resetIn: number;
  }> {
    const now = Date.now();

    const [success, remaining] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [identifier],
      [
        this.max.toString(),
        this.window.toString(),
        // this.ex,
        now.toString(),
      ]
    );

    return {
      success: Boolean(success),
      limit: this.max,
      remaining,
      resetIn: this.window,
    }
  }

  public async refund(identifier: string): Promise<{
    remaining: number;
  }> {
    const count = await this.client.eval<[], number>(
      REFUND_SCRIPT,
      [identifier],
      [], // null?
    );

    return {
      remaining: this.max - count,
    }
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }
}