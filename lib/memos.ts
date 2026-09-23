import { randomToken } from "./crypto";
import { getKV, hgetallJSON, hsetJSON } from "./store/kv";
import { DAY } from "./time";

export interface Memo {
  id: string;
  text: string;
  /** 이 날짜(YYYY-MM-DD)부터 "잊지 말 것"에 뜬다. 없으면 바로 뜬다. */
  date: string | null;
  createdAt: string;
  doneAt: string | null;
}

const KEY = "memos";

export async function listMemos(): Promise<Memo[]> {
  const all = Object.values(await hgetallJSON<Memo>(KEY));
  const now = Date.now();
  const expired = all.filter((m) => m.doneAt && now - Date.parse(m.doneAt) > 14 * DAY).map((m) => m.id);
  if (expired.length) await getKV().hdel(KEY, ...expired);
  return all
    .filter((m) => !expired.includes(m.id))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.createdAt.localeCompare(b.createdAt));
}

export async function addMemo(text: string, date: string | null): Promise<void> {
  const id = randomToken(8);
  const memo: Memo = { id, text: text.trim().slice(0, 300), date, createdAt: new Date().toISOString(), doneAt: null };
  await hsetJSON(KEY, id, memo);
}

export async function toggleMemo(id: string): Promise<void> {
  const memo = (await hgetallJSON<Memo>(KEY))[id];
  if (!memo) return;
  await hsetJSON(KEY, id, { ...memo, doneAt: memo.doneAt ? null : new Date().toISOString() });
}

export async function deleteMemo(id: string): Promise<void> {
  await getKV().hdel(KEY, id);
}
