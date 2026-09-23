import type { LimitWindow, ProviderLimits, ProviderSnapshot, RecentRow, UsageReport, UsageRow } from "./types";

// 에이전트가 보낸 JSON을 믿지 않고 필요한 필드만 골라 담는다.
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e13) : 0);
const str = (v: unknown, max = 100) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const iso = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

function recent(v: unknown): RecentRow | null {
  if (!isObj(v)) return null;
  return {
    model: str(v.model, 80) || "unknown",
    input: num(v.input),
    output: num(v.output),
    cacheRead: num(v.cacheRead),
    cacheWrite: num(v.cacheWrite),
    cacheWrite1h: num(v.cacheWrite1h),
    reasoning: num(v.reasoning),
    requests: num(v.requests),
    webSearches: num(v.webSearches),
  };
}

function row(v: unknown): UsageRow | null {
  if (!isObj(v)) return null;
  const date = str(v.date, 10);
  const base = recent(v);
  if (!base || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, ...base };
}

function windowOf(v: unknown): LimitWindow | null {
  if (!isObj(v) || typeof v.usedPercent !== "number" || !Number.isFinite(v.usedPercent)) return null;
  return {
    id: str(v.id, 40) || "window",
    label: str(v.label, 40) || "한도",
    usedPercent: Math.min(100, Math.max(0, v.usedPercent)),
    windowMinutes: typeof v.windowMinutes === "number" ? v.windowMinutes : null,
    resetsAt: iso(v.resetsAt),
  };
}

function limits(v: unknown): ProviderLimits | null {
  if (!isObj(v)) return null;
  const windows = arr(v.windows).map(windowOf).filter((w): w is LimitWindow => w !== null).slice(0, 8);
  if (!windows.length) return null;
  return {
    source: str(v.source, 60) || "알 수 없음",
    fetchedAt: iso(v.fetchedAt) ?? new Date().toISOString(),
    plan: str(v.plan, 40) || null,
    windows,
  };
}

function snapshot(v: unknown): ProviderSnapshot | null {
  if (!isObj(v)) return null;
  return {
    available: v.available === true,
    error: str(v.error, 300) || null,
    days: arr(v.days).map(row).filter((r): r is UsageRow => r !== null).slice(0, 4000),
    last5h: arr(v.last5h).map(recent).filter((r): r is RecentRow => r !== null).slice(0, 50),
    latestModel: str(v.latestModel, 80) || null,
    limits: limits(v.limits),
    limitsError: str(v.limitsError, 300) || null,
  };
}

export function sanitizeReport(v: unknown): UsageReport | null {
  if (!isObj(v)) return null;
  const host =
    str(v.host, 60)
      .replace(/\s+/g, " ")
      .replace(/[^\w.\- 가-힣]/g, "")
      .trim() || "Mac";
  return {
    host,
    hostId: str(v.hostId, 40).replace(/[^\w-]/g, "") || undefined,
    collectedAt: iso(v.collectedAt) ?? new Date().toISOString(),
    agentVersion: str(v.agentVersion, 20) || undefined,
    claude: snapshot(v.claude),
    codex: snapshot(v.codex),
    macNotifications: isObj(v.macNotifications)
      ? { available: v.macNotifications.available === true, error: str(v.macNotifications.error, 300) || null }
      : null,
  };
}
