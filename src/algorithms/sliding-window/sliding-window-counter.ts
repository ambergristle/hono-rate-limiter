import * as fs from 'fs';
import type { Redis } from '@upstash/redis';

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

const RESET_SCRIPT = fs.readFileSync('./reset.lua', 'utf8');

type SlidingWindowCounterOptions = {
  max: number;
  window: number;
}

class SlidingWindowCounter {

  private readonly client: Redis;

  private readonly max: number;
  private readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: Redis, options: SlidingWindowCounterOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async consume(identifier: string): Promise<void> {
    const now = Date.now();

    const currentWindow = Math.floor(now / this.window);
    const currentKey = `${identifier}:${currentWindow}`;

    const previousWindow = currentWindow - 1;
    const previousKey = `${identifier}:${previousWindow}`;

    const used = await this.client.evalsha<[string, string, string], number>(
      await this.incrementScriptSha,
      [previousKey, currentKey],
      [
        this.windowLimit.toString(),
        now.toString(),
        this.windowMilliseconds.toString(),
        cost.toString(),
      ],
    );

    const success = used <= this.max;

    return {
      success,
      limit: this.max,
      remaining: success ? this.max - used : 0,
      resetIn: (currentWindow + 1) * this.window,
    }
  }

  public async refund(identifier: string, value: number): Promise<void> {
    await this.client.decrby(currentKey, value);
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.eval(
      RESET_SCRIPT,
      [identifier],
      [], // null?
    );
  }
}