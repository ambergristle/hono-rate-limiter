import * as fs from 'fs';
import type { Redis } from '@upstash/redis';
import type { Algorithm } from '../types';
import { RateLimitInfo } from '../../types';

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

const RESET_SCRIPT = fs.readFileSync('./reset.lua', 'utf8');

type FixedWindowCounterOptions = {
  max: number;
  window: number;
}

// can safely increment, even beyond allowed
// assuming cost is the same for all requests using this limiter
// since excess is excess; though may end up wasting tokens if cost > 1
// also complicates refund? or does it?

export class FixedWindowCounter implements Algorithm {
  private readonly client: Redis;

  private readonly max: number;
  private readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: Redis, options: FixedWindowCounterOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async consume(identifier: string, cost: number): Promise<RateLimitInfo & {
    success: boolean;
  }> {
    const currentWindow = Math.floor(Date.now() / this.window);
    const key = [identifier, currentWindow].join(":");

    const used = await this.client.evalsha<[string, string], number>(
      await this.incrementScriptSha,
      [key],
      [
        this.window.toString(),
        cost.toString(),
      ],
    );

    const success = used <= this.max;

    return {
      success,
      window: this.window,
      limit: this.max,
      remaining: success ? this.max - used : 0,
      resetIn: (currentWindow + 1) * this.window,
    }
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const used = await this.client.decrby(identifier, value);
    return {
      remaining: this.max - used,
    };
  }

  public async reset(identifier: string) {
    await this.client.eval(
      RESET_SCRIPT,
      [identifier],
      [], // null?
    );
  }
}