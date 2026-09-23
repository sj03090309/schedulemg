import { MINUTE, dateKey, formatDuration, formatWhen, kstParts, shiftDateKey, startOfDay } from "../time";
import type { FxRate } from "./fx";
import { costUSD, modelLabel, totalTokens } from "./pricing";
import type { Provider, ProviderSnapshot, RecentRow, StoredUsageReport, UsageRow } from "./types";

export interface Totals {
  tokens: number;
  output: number;
  requests: number;
  costUSD: number;
  costKRW: number;
}

export type Level = "ok" | "warning" | "critical";

export interface WindowView {
  id: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetIn: string | null;
  resetAt: string | null;
  /** 데이터를 받은 뒤 리셋 시각이 지나 실제 값을 모른다 */
  hasReset: boolean;
  level: Level;
}

export interface DailyPoint {
  date: string;
  label: string;
  tokens: number;
  costKRW: number;
  isToday: boolean;
}

export interface ModelShare {
  model: string;
  label: string;
  tokens: number;
  costKRW: number;
  share: number;
}

export interface ProviderView {
  provider: Provider;
  name: string;
  status: "ok" | "missing" | "error";
  message: string | null;
  collectedAt: string | null;
  host: string | null;
  stale: boolean;
  today: Totals;
  week: Totals;
  month: Totals;
  last5h: Totals | null;
  daily: DailyPoint[];
  models: ModelShare[];
  latestModel: string | null;
  limits: { source: string; fetchedAt: string; plan: string | null; windows: WindowView[] } | null;
  limitsError: string | null;
}

export interface UsageView {
  claude: ProviderView;
  codex: ProviderView;
  fx: FxRate;
  hasAgent: boolean;
  lastReportAt: string | null;
  /** 가장 최근 보고 기준 맥 알림 수집 상태 */
  macNotifications: { host: string; available: boolean; error: string | null } | null;
}

const NAMES: Record<Provider, string> = { claude: "Claude", codex: "Codex" };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const STALE_AFTER = 20 * MINUTE;

function emptyTotals(): Totals {
  return { tokens: 0, output: 0, requests: 0, costUSD: 0, costKRW: 0 };
}

function addRow(t: Totals, provider: Provider, row: RecentRow & { date?: string }, fx: number, today: string) {
  const usd = costUSD(provider, row, today);
  t.tokens += totalTokens(row);
  t.output += row.output;
  t.requests += row.requests;
  t.costUSD += usd;
  t.costKRW += usd * fx;
}

function mergeRows(rows: UsageRow[]): UsageRow[] {
  const map = new Map<string, UsageRow>();
  for (const r of rows) {
    const key = `${r.date}|${r.model}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...r });
      continue;
    }
    prev.input += r.input;
    prev.output += r.output;
    prev.cacheRead += r.cacheRead;
    prev.cacheWrite += r.cacheWrite;
    prev.cacheWrite1h = (prev.cacheWrite1h ?? 0) + (r.cacheWrite1h ?? 0);
    prev.reasoning = (prev.reasoning ?? 0) + (r.reasoning ?? 0);
    prev.requests += r.requests;
    prev.webSearches = (prev.webSearches ?? 0) + (r.webSearches ?? 0);
  }
  return [...map.values()];
}

function levelOf(used: number): Level {
  if (used >= 90) return "critical";
  if (used >= 70) return "warning";
  return "ok";
}

function summarizeProvider(
  provider: Provider,
  reports: StoredUsageReport[],
  fx: FxRate,
  now: Date,
): ProviderView {
  const today = dateKey(now);
  const weekStart = shiftDateKey(today, -6);
  const month = today.slice(0, 7);
  const base: ProviderView = {
    provider,
    name: NAMES[provider],
    status: "missing",
    message: null,
    collectedAt: null,
    host: null,
    stale: false,
    today: emptyTotals(),
    week: emptyTotals(),
    month: emptyTotals(),
    last5h: null,
    daily: [],
    models: [],
    latestModel: null,
    limits: null,
    limitsError: null,
  };

  const snapshots = reports
    .map((r) => ({ report: r, snap: r[provider] as ProviderSnapshot | null | undefined }))
    .filter((x): x is { report: StoredUsageReport; snap: ProviderSnapshot } => Boolean(x.snap));
  if (!snapshots.length) return base;

  const usable = snapshots.filter((x) => x.snap.available);
  const newest = [...snapshots].sort((a, b) => b.report.collectedAt.localeCompare(a.report.collectedAt))[0];
  base.collectedAt = newest.report.collectedAt;
  base.host = newest.report.host;
  base.stale = now.getTime() - Date.parse(newest.report.collectedAt) > STALE_AFTER;

  if (!usable.length) {
    base.status = "error";
    base.message = newest.snap.error ?? `${NAMES[provider]} 사용 기록을 찾지 못했어요.`;
    return base;
  }
  base.status = "ok";

  const rows = mergeRows(usable.flatMap((x) => x.snap.days ?? []));
  const byModel = new Map<string, Totals>();
  const byDay = new Map<string, Totals>();
  for (const row of rows) {
    if (row.date === today) addRow(base.today, provider, row, fx.rate, today);
    if (row.date >= weekStart && row.date <= today) {
      addRow(base.week, provider, row, fx.rate, today);
      const d = byDay.get(row.date) ?? emptyTotals();
      addRow(d, provider, row, fx.rate, today);
      byDay.set(row.date, d);
    }
    if (row.date.startsWith(month)) {
      addRow(base.month, provider, row, fx.rate, today);
      const m = byModel.get(row.model) ?? emptyTotals();
      addRow(m, provider, row, fx.rate, today);
      byModel.set(row.model, m);
    }
  }

  for (let i = 6; i >= 0; i--) {
    const key = shiftDateKey(today, -i);
    const t = byDay.get(key);
    const p = kstParts(startOfDay(key));
    base.daily.push({
      date: key,
      label: i === 0 ? "오늘" : `${p.month}/${p.day} ${WEEKDAYS[p.weekday]}`,
      tokens: t?.tokens ?? 0,
      costKRW: t?.costKRW ?? 0,
      isToday: i === 0,
    });
  }

  const monthCost = base.month.costKRW || 1;
  base.models = [...byModel.entries()]
    .map(([model, t]) => ({
      model,
      label: modelLabel(model),
      tokens: t.tokens,
      costKRW: t.costKRW,
      share: t.costKRW / monthCost,
    }))
    .sort((a, b) => b.costKRW - a.costKRW)
    .slice(0, 4);

  // 최근 5시간 합계는 20분 안에 들어온 보고만 믿는다.
  const fresh = usable.filter((x) => now.getTime() - Date.parse(x.report.collectedAt) <= STALE_AFTER);
  if (fresh.length) {
    const t = emptyTotals();
    for (const x of fresh) for (const row of x.snap.last5h ?? []) addRow(t, provider, row, fx.rate, today);
    base.last5h = t;
  }

  base.latestModel =
    [...usable].sort((a, b) => b.report.collectedAt.localeCompare(a.report.collectedAt))[0].snap.latestModel ?? null;

  const withLimits = usable
    .filter((x) => x.snap.limits && x.snap.limits.windows.length)
    .sort((a, b) => b.snap.limits!.fetchedAt.localeCompare(a.snap.limits!.fetchedAt));
  if (withLimits.length) {
    const limits = withLimits[0].snap.limits!;
    base.limits = {
      source: limits.source,
      fetchedAt: limits.fetchedAt,
      plan: limits.plan ?? null,
      windows: limits.windows.map((w) => {
        const resetMs = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
        const hasReset = Number.isFinite(resetMs) && resetMs <= now.getTime();
        const used = hasReset ? 0 : Math.min(100, Math.max(0, w.usedPercent));
        return {
          id: w.id,
          label: w.label,
          usedPercent: used,
          remainingPercent: 100 - used,
          resetIn: Number.isFinite(resetMs) && !hasReset ? formatDuration(resetMs - now.getTime()) : null,
          resetAt: Number.isFinite(resetMs) && !hasReset ? formatWhen(new Date(resetMs), now) : null,
          hasReset,
          level: levelOf(used),
        };
      }),
    };
  }
  base.limitsError = newest.snap.limitsError ?? null;
  return base;
}

export function summarizeUsage(reports: StoredUsageReport[], fx: FxRate, now: Date = new Date()): UsageView {
  const lastReportAt = reports.length
    ? reports.map((r) => r.collectedAt).sort().at(-1) ?? null
    : null;
  const newest = [...reports].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0];
  return {
    claude: summarizeProvider("claude", reports, fx, now),
    codex: summarizeProvider("codex", reports, fx, now),
    fx,
    hasAgent: reports.length > 0,
    lastReportAt,
    macNotifications: newest?.macNotifications
      ? { host: newest.host, available: newest.macNotifications.available, error: newest.macNotifications.error ?? null }
      : null,
  };
}
