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
    // automaticDeserialization을 끄면 HGETALL 결과가 [필드, 값, 필드, 값, ...] 배열 그대로 온다.
    const raw: unknown = await this.redis.hgetall(key);
    if (!Array.isArray(raw)) return (raw as Record<string, string> | null) ?? {};
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }

  async hset(key: string, entries: Record<string, string>): Promise<void> {
    if (Object.keys(entries).length) await this.redis.hset(key, entries);
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length) await this.redis.hdel(key, ...fields);
  }
}
