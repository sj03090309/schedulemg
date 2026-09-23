/** 동시에 limit개까지만 실행하며 순서를 유지한다. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

// 자동 새로고침과 여러 섹션이 같은 Google API를 반복 호출하지 않도록 인스턴스 메모리에 짧게 캐시한다.
type Entry = { exp: number; value: Promise<unknown> };
const g = globalThis as unknown as { __smgMemo?: Map<string, Entry> };
const memo = (g.__smgMemo ??= new Map<string, Entry>());

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as Promise<T>;
  const value = fn();
  memo.set(key, { exp: Date.now() + ttlMs, value });
  value.catch(() => memo.delete(key));
  return value;
}

export function clearCached(prefix = ""): void {
  for (const k of memo.keys()) if (k.startsWith(prefix)) memo.delete(k);
}
