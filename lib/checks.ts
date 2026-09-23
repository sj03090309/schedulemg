import { getKV } from "./store/kv";
import { DAY } from "./time";

// 과제·메일처럼 원본을 바꿀 수 없는 항목을 "확인함"으로 표시해 둔다. 값은 확인한 시각(ISO).
const KEY = "checks";

export async function loadChecks(): Promise<Record<string, string>> {
  const all = await getKV().hgetall(KEY);
  const now = Date.now();
  const expired = Object.entries(all)
    .filter(([, at]) => now - Date.parse(at) > 30 * DAY)
    .map(([k]) => k);
  if (expired.length) {
    await getKV().hdel(KEY, ...expired);
    for (const k of expired) delete all[k];
  }
  return all;
}

export async function toggleCheck(key: string): Promise<void> {
  const kv = getKV();
  const all = await kv.hgetall(KEY);
  if (all[key]) await kv.hdel(KEY, key);
  else await kv.hset(KEY, { [key]: new Date().toISOString() });
}
