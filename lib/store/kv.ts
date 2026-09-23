import path from "node:path";
import { env } from "../env";
import { FileKV } from "./file-kv";
import { RedisKV } from "./redis-kv";

/**
 * 아주 작은 키-값 저장소 인터페이스.
 * - 배포(Vercel): Upstash Redis (Vercel Marketplace가 KV_REST_API_URL/TOKEN을 넣어 준다)
 * - 로컬 실행: 프로젝트의 .data/store.json 파일
 */
export interface KV {
  readonly kind: "redis" | "file";
  /** 서버를 다시 시작해도 데이터가 남는지 */
  readonly persistent: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, entries: Record<string, string>): Promise<void>;
  hdel(key: string, ...fields: string[]): Promise<void>;
}

const g = globalThis as unknown as { __smgKV?: KV };

export function getKV(): KV {
  if (g.__smgKV) return g.__smgKV;
  let kv: KV;
  if (env.redisUrl && env.redisToken) {
    kv = new RedisKV(env.redisUrl, env.redisToken);
  } else if (process.env.VERCEL) {
    // Vercel 함수의 파일 시스템은 /tmp만 쓸 수 있고 인스턴스가 바뀌면 사라진다.
    kv = new FileKV("/tmp/schedulemg-store.json", false);
  } else {
    kv = new FileKV(path.join(process.cwd(), ".data", "store.json"), true);
  }
  g.__smgKV = kv;
  return kv;
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getKV().get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  await getKV().set(key, JSON.stringify(value), ttlSeconds);
}

export async function hgetallJSON<T>(key: string): Promise<Record<string, T>> {
  const raw = await getKV().hgetall(key);
  const out: Record<string, T> = {};
  for (const [field, value] of Object.entries(raw)) {
    try {
      out[field] = JSON.parse(value) as T;
    } catch {
      // 손상된 항목은 건너뛴다.
    }
  }
  return out;
}

export async function hsetJSON(key: string, field: string, value: unknown): Promise<void> {
  await getKV().hset(key, { [field]: JSON.stringify(value) });
}

export async function hsetManyJSON(key: string, entries: Record<string, unknown>): Promise<void> {
  const serialized: Record<string, string> = {};
  for (const [field, value] of Object.entries(entries)) serialized[field] = JSON.stringify(value);
  if (Object.keys(serialized).length) await getKV().hset(key, serialized);
}
