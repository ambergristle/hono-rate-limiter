import * as fs from 'fs';
import type { Redis } from '@upstash/redis';

type IncrementArgs = [string, string, string, string];
type IncrementData = [number, number];

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

const RESET_SCRIPT = fs.readFileSync('./reset.lua', 'utf8');

type SlidingWindowCounterOptions = {
  max: number;
  window: number;
}

export class SlidingWindowCounter {

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

  public async consume(identifier: string, cost: number): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    resetIn: number;
  }> {
    const now = Date.now();

    const currentWindow = Math.floor(now / this.window);
    const currentKey = `${identifier}:${currentWindow}`;

    const previousWindow = currentWindow - 1;
    const previousKey = `${identifier}:${previousWindow}`;

    const [success, remaining] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [previousKey, currentKey],
      [
        this.window.toString(),
        this.max.toString(),
        cost.toString(),
        now.toString()
      ],
    );

    return {
      success: Boolean(success),
      limit: this.max,
      remaining,
      resetIn: (currentWindow + 1) * this.window,
    }
  }

  public async refund(identifier: string, value: number): Promise<{
    remaining: number;
  }> {
    const used = await this.client.evalsha<[string], number>(
      await this.incrementScriptSha,
      [identifier],
      [value.toString()],
    );

    return {
      remaining: this.max - used,
    }
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.eval(
      RESET_SCRIPT,
      [identifier],
      [], // null?
    );
  }
}