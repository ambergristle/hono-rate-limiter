// import type { Redis as UpstashRedis } from '@upstash/redis';

// how do refunds affect reset times?
// figure out error handling
// figure out key generation, esp wrt refunding
// specifically, how to refund log
// or any windows, really. what happens if tick over to next window?

// i guess that any values stored in the scope of the middleware handler
// itself will get reset on each invocation/request
// that actually scans, assuming that i grabbed the keygen directly from HRL

// above doesn't hold for clients and adapters and whatever plugged in
// so we need to pass keys out of wherever they're generated
// what happens if decrby on a key that doesn't exist?

// or could full-on return method

type RedisAdapter = {
  decrby: (key: string, value: number) => Promise<number>;
  del: (...keys: string[]) => Promise<number>;
  evalsha: <TArgs extends string[], TData = unknown>(sha1: string, keys: string[], args: TArgs) => Promise<TData>;
  incrby: (key: string, value: number) => Promise<number>;
  scriptLoad: (script: string) => Promise<string>;
}

type UpstashRedis = {
  decrby: (key: string, decrement: number) => Promise<number>;
  // or args?
  del: (...keys: string[]) => Promise<number>;
  evalsha: <TArgs extends unknown[], TData = unknown>(sha1: string, keys: string[], args: TArgs) => Promise<TData>;
  incrby: (key: string, value: number) => Promise<number>;
  scriptLoad: (script: string) => Promise<string>;
}

class UpstashRedisAdapter implements RedisAdapter {
  private client: UpstashRedis;

  constructor(client: UpstashRedis) {
    this.client = client;
  }

  public decrby(key: string, value: number): Promise<number> {
    return this.client.decrby(key, value);
  }

  public del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  public evalsha<TArgs extends string[], TData = unknown>(sha1: string, keys: string[], args: TArgs): Promise<TData> {
    return this.client.evalsha<TArgs, TData>(sha1, keys, args);
  }

  public incrby(key: string, value: number): Promise<number> {
    return this.client.incrby(key, value);
  };

  public scriptLoad(script: string): Promise<string> {
    return this.client.scriptLoad(script);
  }
}

type NodeRedis = {
  decrBy: (key: string, value: number) => Promise<number>;
  del: (...args: string[]) => Promise<number>;
  evalSha: (sha1: string, options?: { keys?: string[]; args?: string[] }) => Promise<any>;
  incrBy: (key: string, value: number) => Promise<number>;
  scriptLoad: (script: string) => Promise<string>;
}

class NodeRedisAdapter implements RedisAdapter {
  private client: NodeRedis;

  constructor(client: NodeRedis) {
    this.client = client;
  }

  public decrby(key: string, value: number): Promise<number> {
    return this.client.decrBy(key, value);
  }

  public del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  public evalsha<TArgs extends string[], TData = unknown>(sha1: string, keys: string[], args: TArgs): Promise<TData> {
    return this.client.evalSha(sha1, { keys, args });
  }

  public incrby(key: string, value: number): Promise<number> {
    return this.client.incrBy(key, value);
  };

  public scriptLoad(script: string): Promise<string> {
    return this.client.scriptLoad(script);
  }
}


// try {
//   return await evalsha(sha1, keys, args);
// } catch (error) {
//   if (`${error}`.includes('NOSCRIPT')) {
//     const hash = await client.scriptLoad(INCREMENT_SCRIPT);

//     return await evalsha(hash, keys, args);
//   }

//   throw error;
// }

const INCREMENT_SCRIPT = "";


type SlidingWindowCounterOptions = {
  adapter: RedisAdapter;
  // cost
}

// requires two keys, one for each window
// core value is derived from identifier + window #
// should include prefixing
class SlidingWindowCounter {
  private readonly client: RedisAdapter;

  private readonly keyPrefix: string;
  private readonly windowLimit: number;
  private readonly windowMilliseconds: number;

  private incrementScriptSha: Promise<string>;

  constructor({ adapter }: SlidingWindowCounterOptions) {
    this.client = adapter;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async refund(identifier: string): Promise<void> {
    const now = Date.now();
    const clientIdentifier = this.prefixKey(identifier);

    const currentWindow = Math.floor(now / this.windowMilliseconds);
    const currentKey = [clientIdentifier, currentWindow].join(':');

    await this.client.decrby(currentKey, value);
  }

  public async limit(identifier: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const clientIdentifier = this.prefixKey(identifier);

    const currentWindow = Math.floor(now / this.windowMilliseconds);
    const currentKey = [clientIdentifier, currentWindow].join(':');

    const previousWindow = currentWindow - 1;
    const previousKey = [clientIdentifier, previousWindow].join(':');

    const totalHits = await this.client.evalsha(
      await this.incrementScriptSha,
      [previousKey, currentKey],
      [this.windowLimit, this.windowMilliseconds, this.cost, now]
    );

    return {
      key: currentKey,
      totalHits,
      resetTime: new Date((currentWindow + 1) * this.windowMilliseconds),
    }
  }

  public async resetKey(identifier: string): Promise<void> {
    const now = Date.now();
    const clientIdentifier = this.prefixKey(identifier);

    const currentWindow = Math.floor(now / this.windowMilliseconds);
    const currentKey = [clientIdentifier, currentWindow].join(':');

    const previousWindow = currentWindow - 1;
    const previousKey = [clientIdentifier, previousWindow].join(':');

    await this.client.del([previousKey, currentKey]);
  }
}

// i expect we can just use client identifier as key
// though following pattern would mean using window/bucket
// should still prefix key
class SlidingWindowLog {
  private readonly client: RedisAdapter;

  private readonly keyPrefix: string;
  private readonly windowLimit: number;
  private readonly windowMilliseconds: number;
  private readonly expiresInMilliseconds: number;

  private readonly incrementScriptSha: Promise<string>;

  constructor() {
    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async limit(identifier: string) {
    const now = Date.now();

    this.client.evalsha(
      await this.incrementScriptSha,
      [key],
      [
        this.windowLimit,
        this.windowMilliseconds,
        this.expiresInMilliseconds,
        this.cost,
        now,
      ]
    );

    return {
      key
    }
  }

  public async refund() {
    // pop latest?
  }

  public async resetKey(identifier: string) {
    await this.client.del(key);
  }
}

// key is just identifier; add prefix appending
class TokenBucket {
  private readonly client: RedisAdapter;

  private readonly incrementScriptSha: Promise<string>;

  constructor() {
    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public async limit(identifier: string) {
    // cache check

    const now = Date.now();

    // const incrementBy = rate ? Math.max(1, rate) : 1;

    const [remaining, reset] = await this.client.evalsha<any[], [number, number]>(
      await this.incrementScriptSha,
      [key],
      [
        this.windowLimit,
        this.windowMilliseconds,
        this.cost,
        now,
      ]
    )
  }

  public async refund(identifier: string): Promise<number> {
    return await this.client.incrby(key, this.cost);
  }

  public async resetKey(identifier: string) {
    await this.client.del(key);
  }
}