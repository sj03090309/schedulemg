import { Redis } from "@upstash/redis";
import type { KV } from "./kv";

export class RedisKV implements KV {
  readonly kind = "redis" as const;
  readonly persistent = true;
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    // 값은 항상 우리가 직접 JSON 문자열로 다룬다.
    this.redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async get(key: string): Promise<string | null> {
    return (await this.redis.get<string>(key)) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.redis.set(key, value, { ex: ttlSeconds });
    else await this.redis.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return (await this.redis.hgetall<Record<string, string>>(key)) ?? {};
  }

  async hset(key: string, entries: Record<string, string>): Promise<void> {
    if (Object.keys(entries).length) await this.redis.hset(key, entries);
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length) await this.redis.hdel(key, ...fields);
  }
}
