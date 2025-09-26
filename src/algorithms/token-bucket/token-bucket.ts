import * as fs from 'fs';
import type { Redis } from '@upstash/redis';

type IncrementArgs = [string, string, string, string, string];
type IncrementData = [number, number, number];

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

type TokenBucketOptions = {
  max: number;
  refillInterval: number;
  refillRate: number;
}

export class TokenBucket {
  private readonly client: Redis;

  private readonly max: number;
  private readonly refillInterval: number;
  private readonly refillRate: number;

  private readonly incrementScriptSha: Promise<string>;

  constructor(client: Redis, options: TokenBucketOptions) {
    this.client = client;

    this.max = options.max;
    this.refillInterval = options.refillInterval * 1000;
    this.refillRate = options.refillRate;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async consume(identifier: string, cost: number): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    resetIn: number;
  }> {
    // todo: check cache
    // todo: if cost < 1

    const now = Date.now();

    const [
      success,
      remaining,
      resetIn
    ] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [identifier],
      [
        this.max.toString(),
        this.refillInterval.toString(),
        this.refillRate.toString(),
        cost.toString(),
        now.toString(),
      ],
    );

    return {
      success: Boolean(success),
      limit: this.max,
      remaining,
      resetIn,
    }
  }

  public async refund(identifier: string, value: number): Promise<{
    remaining: number;
  }> {
    const remaining = await this.client.incrby(identifier, value);
    return {
      remaining,
    };
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }

}