import type { RedisClient } from "./types";

export const safeEval = async <TArgs extends unknown[], TData = unknown>(
  client: RedisClient,
  script: {
    hash: string;
    script: string;
  },
  keys: any[],
  args: TArgs,
): Promise<TData> => {
  try {
    return await client.evalsha(script.hash, keys, args)
  } catch (error) {
    if (`${error}`.includes("NOSCRIPT")) {
      return await client.eval(script.script, keys, args)
    }
    throw error;
  }
}

