import * as fs from 'fs';
import type { Redis } from '@upstash/redis';
import { RateLimitInfo } from '../../types';

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

  private incrementScriptSha: Promise<string>;

  constructor(client: Redis, options: SlidingWindowLogOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;
    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async consume(identifier: string): Promise<RateLimitInfo & {
    success: boolean;
  }> {
    const now = Date.now();

    const [success, remaining] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [identifier],
      [
        this.max.toString(),
        this.window.toString(),
        now.toString(),
      ]
    );

    return {
      success: Boolean(success),
      window: this.window,
      limit: this.max,
      remaining,
      resetIn: this.window,
    }
  }

  public async refund(identifier: string): Promise<Pick<RateLimitInfo, 'remaining'>> {
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