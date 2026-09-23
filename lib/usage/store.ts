import { getKV, hgetallJSON, hsetJSON } from "../store/kv";
import type { StoredUsageReport, UsageReport } from "./types";

// 맥이 여러 대여도 되도록 맥마다 마지막 보고 하나만 저장한다(키: 고정 ID, 없으면 이름).
const KEY = "usage:reports";

export const reportKey = (r: Pick<UsageReport, "host" | "hostId">) => r.hostId || r.host;

export async function saveUsageReport(report: UsageReport): Promise<void> {
  const stored: StoredUsageReport = { ...report, receivedAt: new Date().toISOString() };
  await hsetJSON(KEY, reportKey(report), stored);
}

export async function loadUsageReports(): Promise<StoredUsageReport[]> {
  const all = await hgetallJSON<StoredUsageReport>(KEY);
  return Object.values(all).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function removeUsageHost(key: string): Promise<void> {
  await getKV().hdel(KEY, key);
}
