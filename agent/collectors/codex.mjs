import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { forEachLine, listFiles, readJSON, writeJSON } from "../lib/files.mjs";
import { DAY, HOUR, kstDateKey, kstDayStart } from "../lib/time.mjs";

// Codex CLI는 세션을 ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl 에 남긴다.
// 응답마다 token_usage_record(최신 형식) 또는 token_count 이벤트가 있고, token_count에는 요금제 한도(rate_limits)도 들어 있다.
const RETENTION_DAYS = 35;
const CACHE_VERSION = 1;
const LIVE_TTL = 10 * 60 * 1000;
const FIELDS = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];

const keyOf = (s) => createHash("sha1").update(s).digest("base64url").slice(0, 12);

function codexHome() {
  return process.env.CODEX_HOME || path.join(homedir(), ".codex");
}

export async function collectCodex(config, now = Date.now()) {
  const home = codexHome();
  const dirs = ["sessions", "archived_sessions"].map((d) => path.join(home, d)).filter((d) => existsSync(d));
  if (!dirs.length) return { available: false, error: "Codex 세션 폴더(~/.codex/sessions)를 찾지 못했어요.", days: [] };
  const cutoff = kstDayStart(now) - RETENTION_DAYS * DAY;

  const cacheFile = path.join(config.stateDir, "codex-usage-cache.json");
  const cache = readJSON(cacheFile, null);
  const valid = cache?.version === CACHE_VERSION;
  const models = valid ? cache.models : [];
  const modelIndex = new Map(models.map((m, i) => [m, i]));
  const intern = (name) => {
    let i = modelIndex.get(name);
    if (i === undefined) {
      i = models.length;
      models.push(name);
      modelIndex.set(name, i);
    }
    return i;
  };
  const prevFiles = valid ? cache.files : {};
  const nextFiles = {};

  const files = (
    await Promise.all(
      dirs.map((d) => listFiles(d, (n) => n.startsWith("rollout-") && n.endsWith(".jsonl"), { maxDepth: 5, minMtimeMs: cutoff })),
    )
  ).flat();

  let parsed = 0;
  for (const f of files) {
    const prev = prevFiles[f.path];
    if (prev && prev.mtimeMs === f.mtimeMs && prev.size === f.size) {
      nextFiles[f.path] = prev;
      continue;
    }
    nextFiles[f.path] = { mtimeMs: f.mtimeMs, size: f.size, ...(await parseFile(f.path, cutoff, intern)) };
    parsed++;
  }
  writeJSON(cacheFile, { version: CACHE_VERSION, models, files: nextFiles });

  const seen = new Set();
  const days = new Map();
  const recent = new Map();
  const recentCutoff = now - 5 * HOUR;
  let latest = { ts: 0, model: null };
  let latestLimits = null;
  for (const file of Object.values(nextFiles)) {
    if (file.limits && (!latestLimits || file.limits.ts > latestLimits.ts)) latestLimits = file.limits;
    for (const [key, tsSec, mi, input, cacheRead, cacheWrite, output, reasoning] of file.entries) {
      if (seen.has(key)) continue;
      seen.add(key);
      const ts = tsSec * 1000;
      const model = models[mi];
      const values = { input, cacheRead, cacheWrite, output, reasoning };
      const date = kstDateKey(ts);
      add(days, `${date}|${model}`, { date, model }, values);
      if (ts >= recentCutoff) add(recent, model, { model }, values);
      if (ts > latest.ts) latest = { ts, model };
    }
  }

  const result = {
    available: true,
    days: [...days.values()],
    last5h: [...recent.values()],
    latestModel: latest.model,
    limits: null,
    stats: { files: files.length, parsed, responses: seen.size },
  };
  if (latestLimits) {
    const windows = windowsFromLog(latestLimits.rl, latestLimits.ts);
    if (windows.length) {
      result.limits = {
        source: "Codex 세션 기록",
        fetchedAt: new Date(latestLimits.ts).toISOString(),
        plan: latestLimits.rl.plan_type ?? null,
        windows,
      };
    }
  }
  // 이 맥에서 Codex를 쓴 기록이 없을 때만(웹에서만 쓰는 경우) 계정 사용량을 직접 조회한다.
  if (!result.limits && config.liveLimits) {
    try {
      result.limits = await liveLimits(config, home);
    } catch (e) {
      result.limitsError = e.message;
    }
  }
  return result;
}

async function parseFile(file, cutoff, intern) {
  const records = [];
  const counts = [];
  const turnModel = new Map();
  let model = null;
  let prevTotal = null;
  let limits = null;

  await forEachLine(file, (line) => {
    if (!line.includes('"token_usage_record"') && !line.includes('"token_count"') && !line.includes('"turn_context"')) return;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      return;
    }
    const p = o.payload ?? {};
    const ts = Date.parse(o.timestamp);
    if (o.type === "turn_context") {
      if (p.model) {
        model = p.model;
        if (p.turn_id) turnModel.set(p.turn_id, p.model);
      }
      return;
    }
    if (o.type === "token_usage_record") {
      if (!p.usage || !Number.isFinite(ts) || ts < cutoff) return;
      const m = turnModel.get(p.turn_id) ?? turnModel.get(p.root_turn_id) ?? model ?? "gpt-5";
      records.push(entry(p.response_id ?? `${file}:${o.ordinal ?? ts}`, ts, intern(m), p.usage));
      return;
    }
    if (o.type === "event_msg" && p.type === "token_count") {
      if (p.rate_limits && Number.isFinite(ts) && (!limits || ts >= limits.ts)) limits = { ts, rl: p.rate_limits };
      // 예전 형식: 누적 합계의 차이를 이번 응답의 사용량으로 본다(같은 이벤트가 두 번 찍혀도 차이는 0).
      const total = p.info?.total_token_usage;
      const last = p.info?.last_token_usage;
      let delta = null;
      if (total) {
        delta = !prevTotal ? total : total.total_tokens >= prevTotal.total_tokens ? diff(total, prevTotal) : last;
        prevTotal = total;
      } else if (last) {
        delta = last;
      }
      if (delta && (delta.total_tokens ?? 0) > 0 && Number.isFinite(ts) && ts >= cutoff) {
        counts.push(entry(`${file}:${o.ordinal ?? ts}`, ts, intern(model ?? "gpt-5"), delta));
      }
    }
  });
  // 새 형식 기록이 있으면 그것만 쓴다. 두 가지를 합치면 두 번 세게 된다.
  return { entries: records.length ? records : counts, limits };
}

// [키, 시각(초), 모델, 캐시 안 된 입력, 캐시 읽기, 캐시 쓰기, 출력, 추론]
function entry(key, ts, mi, u) {
  const cached = u.cached_input_tokens ?? 0;
  const cacheWrite = u.cache_write_input_tokens ?? 0;
  return [
    keyOf(String(key)),
    Math.floor(ts / 1000),
    mi,
    Math.max(0, (u.input_tokens ?? 0) - cached - cacheWrite),
    cached,
    cacheWrite,
    u.output_tokens ?? 0,
    u.reasoning_output_tokens ?? 0,
  ];
}

function diff(a, b) {
  const out = {};
  for (const k of FIELDS) out[k] = Math.max(0, (a[k] ?? 0) - (b[k] ?? 0));
  return out;
}

function add(map, key, base, v) {
  const row = map.get(key) ?? { ...base, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, requests: 0 };
  row.input += v.input;
  row.output += v.output;
  row.cacheRead += v.cacheRead;
  row.cacheWrite += v.cacheWrite;
  row.reasoning += v.reasoning;
  row.requests += 1;
  map.set(key, row);
}

function windowLabel(minutes) {
  if (!minutes) return "사용";
  if (minutes >= 10_000 && minutes <= 10_200) return "주간";
  if (minutes <= 24 * 60) return `${Math.round(minutes / 60)}시간`;
  return `${Math.round(minutes / 1440)}일`;
}

function windowsFromLog(rl, eventTs) {
  const out = [];
  for (const [id, w] of [
    ["primary", rl.primary],
    ["secondary", rl.secondary],
  ]) {
    if (!w || typeof w.used_percent !== "number") continue;
    const minutes = w.window_minutes ?? null;
    const resetsAt = w.resets_at
      ? new Date(w.resets_at * 1000).toISOString()
      : w.resets_in_seconds != null
        ? new Date(eventTs + w.resets_in_seconds * 1000).toISOString()
        : null;
    out.push({ id, label: windowLabel(minutes), usedPercent: w.used_percent, windowMinutes: minutes, resetsAt });
  }
  return out;
}

/** Codex CLI의 /status와 같은 계정 사용량 조회. 로그인 토큰은 읽기만 하고 결과 숫자만 보낸다. */
async function liveLimits(config, home) {
  const stateFile = path.join(config.stateDir, "codex-limits.json");
  const cached = readJSON(stateFile, null);
  if (cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < LIVE_TTL) return cached;

  const auth = readJSON(path.join(home, "auth.json"), null);
  const t = auth?.tokens;
  if (!t?.access_token) throw new Error("Codex 로그인 정보를 찾지 못했어요.");
  const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      "ChatGPT-Account-Id": t.account_id ?? "",
      "User-Agent": "codex_cli_rs",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Codex 사용량 조회 실패 (HTTP ${res.status})`);
  const j = await res.json();
  const rl = j.rate_limit ?? j.rate_limits ?? {};
  const windows = [];
  for (const [id, w] of [
    ["primary", rl.primary_window ?? rl.primary],
    ["secondary", rl.secondary_window ?? rl.secondary],
  ]) {
    if (!w || typeof w.used_percent !== "number") continue;
    const minutes = w.limit_window_seconds ? Math.round(w.limit_window_seconds / 60) : (w.window_minutes ?? null);
    const resetSec = w.reset_at ?? w.resets_at;
    const resetsAt = resetSec
      ? new Date(resetSec * 1000).toISOString()
      : w.reset_after_seconds != null
        ? new Date(Date.now() + w.reset_after_seconds * 1000).toISOString()
        : null;
    windows.push({ id, label: windowLabel(minutes), usedPercent: w.used_percent, windowMinutes: minutes, resetsAt });
  }
  if (!windows.length) throw new Error("Codex 사용량 응답에서 한도 정보를 찾지 못했어요.");
  const limits = { source: "ChatGPT 계정 사용량", fetchedAt: new Date().toISOString(), plan: j.plan_type ?? null, windows };
  writeJSON(stateFile, limits);
  return limits;
}
