import type { MailInsightView } from "./google/gmail";
import { getKV, hgetallJSON, hsetManyJSON } from "./store/kv";
import { DAY } from "./time";

// 맥 에이전트가 Claude로 판단한 메일별 중요도와 요약. 키는 "계정이메일:메일ID".
export interface MailInsight extends MailInsightView {
  /** 모델이 결과를 주지 않아 건너뛴 메일 (다시 묻지 않도록 표시만 해 둔다) */
  skipped?: boolean;
  at: string;
}

const KEY = "mail:insights";

export const insightKey = (account: string, id: string) => `${account}:${id}`;

export async function loadInsights(): Promise<Record<string, MailInsight>> {
  const all = await hgetallJSON<MailInsight>(KEY);
  const now = Date.now();
  const old = Object.entries(all)
    .filter(([, v]) => now - Date.parse(v.at) > 14 * DAY)
    .map(([k]) => k);
  if (old.length) {
    await getKV().hdel(KEY, ...old);
    for (const k of old) delete all[k];
  }
  return all;
}

export async function saveInsights(entries: Record<string, MailInsight>): Promise<void> {
  await hsetManyJSON(KEY, entries);
}

/** "2026-09-26T18:00+09:00", "2026-09-26 18:00", "2026-09-26" 모두 받는다. 시간대가 없으면 KST. */
export function parseDue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/);
  const t = Date.parse(m ? `${m[1]}T${m[2] ?? "23:59"}:00+09:00` : s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
