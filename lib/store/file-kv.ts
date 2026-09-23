import { promises as fs } from "node:fs";
import path from "node:path";
import type { KV } from "./kv";

interface FileData {
  kv: Record<string, { v: string; exp?: number }>;
  h: Record<string, Record<string, string>>;
}

// 개발 서버의 HMR로 모듈이 다시 로드되어도 쓰기 순서가 꼬이지 않도록 잠금을 전역에 둔다.
const g = globalThis as unknown as { __smgFileLock?: Promise<unknown> };

export class FileKV implements KV {
  readonly kind = "file" as const;

  constructor(
    private readonly file: string,
    readonly persistent: boolean,
  ) {}

  private async read(): Promise<FileData> {
    try {
      const data = JSON.parse(await fs.readFile(this.file, "utf8")) as Partial<FileData>;
      return { kv: data.kv ?? {}, h: data.h ?? {} };
    } catch {
      return { kv: {}, h: {} };
    }
  }

  private async write(data: FileData): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }

  private mutate(fn: (data: FileData) => void): Promise<void> {
    const run = async () => {
      const data = await this.read();
      fn(data);
      await this.write(data);
    };
    const next = (g.__smgFileLock ?? Promise.resolve()).then(run, run);
    g.__smgFileLock = next.catch(() => undefined);
    return next;
  }

  async get(key: string): Promise<string | null> {
    const entry = (await this.read()).kv[key];
    if (!entry || (entry.exp && entry.exp < Date.now())) return null;
    return entry.v;
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    return this.mutate((d) => {
      d.kv[key] = { v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined };
    });
  }

  del(key: string): Promise<void> {
    return this.mutate((d) => {
      delete d.kv[key];
      delete d.h[key];
    });
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return { ...((await this.read()).h[key] ?? {}) };
  }

  hset(key: string, entries: Record<string, string>): Promise<void> {
    return this.mutate((d) => {
      d.h[key] = { ...(d.h[key] ?? {}), ...entries };
    });
  }

  hdel(key: string, ...fields: string[]): Promise<void> {
    return this.mutate((d) => {
      const hash = d.h[key];
      if (hash) for (const f of fields) delete hash[f];
    });
  }
}
