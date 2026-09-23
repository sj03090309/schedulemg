import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { forEachLine, listFiles, readJSON, writeJSON } from "../lib/files.mjs";
import { DAY, HOUR, kstDateKey, kstDayStart } from "../lib/time.mjs";

// Claude Code는 대화 기록을 ~/.claude/projects/**/*.jsonl 에 남기고, 응답마다 토큰 사용량(usage)이 들어 있다.
const RETENTION_DAYS = 35;
const CACHE_VERSION = 2;
const LIMITS_TTL = 5 * 60 * 1000;
const REFRESH_COOLDOWN = 30 * 60 * 1000;
const execFileAsync = promisify(execFile);

function projectDirs() {
  const dirs = new Set();
  for (const d of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    dirs.add(path.join(d, "projects"));
  }
  dirs.add(path.join(homedir(), ".config", "claude", "projects"));
  dirs.add(path.join(homedir(), ".claude", "projects"));
  return [...dirs].filter((d) => existsSync(d));
}

const keyOf = (s) => createHash("sha1").update(s).digest("base64url").slice(0, 12);

export async function collectClaude(config, now = Date.now()) {
  const dirs = projectDirs();
  if (!dirs.length) {
    return { available: false, error: "Claude Code 기록 폴더(~/.claude/projects)를 찾지 못했어요.", days: [] };
  }
  const cutoff = kstDayStart(now) - RETENTION_DAYS * DAY;

  // 바뀐 파일만 다시 읽도록 파일별 추출 결과를 캐시해 둔다.
  const cacheFile = path.join(config.stateDir, "claude-usage-cache.json");
  const cache = readJSON(cacheFile, null);
  const valid = cache?.version === CACHE_VERSION;
  const models = valid ? cache.models : [];
  const modelIndex = new Map(models.map((m, i) => [m, i]));
  const prevFiles = valid ? cache.files : {};
  const nextFiles = {};
  const intern = (name) => {
    let i = modelIndex.get(name);
    if (i === undefined) {
      i = models.length;
      models.push(name);
      modelIndex.set(name, i);
    }
    return i;
  };

  const files = (
    await Promise.all(dirs.map((d) => listFiles(d, (n) => n.endsWith(".jsonl"), { maxDepth: 5, minMtimeMs: cutoff })))
  ).flat();

  let parsed = 0;
  for (const f of files) {
    const prev = prevFiles[f.path];
    if (prev && prev.mtimeMs === f.mtimeMs && prev.size === f.size) {
      nextFiles[f.path] = prev;
      continue;
    }
    const entries = [];
    await forEachLine(f.path, (line) => {
      if (!line.includes('"usage"') || !line.includes('"assistant"')) return;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        return;
      }
      if (o?.type !== "assistant") return;
      const msg = o.message;
      const u = msg?.usage;
      if (!u || !msg.model || msg.model === "<synthetic>") return;
      const ts = Date.parse(o.timestamp);
      if (!Number.isFinite(ts) || ts < cutoff) return;
      const cw1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      const cw5m = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - cw1h);
      const name = u.speed === "fast" ? `${msg.model}:fast` : msg.model;
      entries.push([
        keyOf(`${msg.id ?? o.uuid}:${o.requestId ?? ""}`),
        Math.floor(ts / 1000),
        intern(name),
        u.input_tokens ?? 0,
        u.output_tokens ?? 0,
        cw5m,
        cw1h,
        u.cache_read_input_tokens ?? 0,
        u.server_tool_use?.web_search_requests ?? 0,
      ]);
    });
    nextFiles[f.path] = { mtimeMs: f.mtimeMs, size: f.size, entries };
    parsed++;
  }
  writeJSON(cacheFile, { version: CACHE_VERSION, models, files: nextFiles });

  // 같은 응답이 여러 줄(스트리밍)·여러 파일(이어하기)에 남아 있어도 한 번만 센다.
  const seen = new Set();
  const days = new Map();
  const recent = new Map();
  const recentCutoff = now - 5 * HOUR;
  let latest = { ts: 0, model: null };
  for (const file of Object.values(nextFiles)) {
    for (const [key, tsSec, mi, input, output, cacheWrite, cacheWrite1h, cacheRead, webSearches] of file.entries) {
      if (seen.has(key)) continue;
      seen.add(key);
      const ts = tsSec * 1000;
      const model = models[mi];
      const values = { input, output, cacheWrite, cacheWrite1h, cacheRead, webSearches };
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
    latestModel: latest.model ? latest.model.replace(/:fast$/, "") : null,
    stats: { files: files.length, parsed, messages: seen.size },
  };
  if (config.liveLimits) {
    try {
      result.limits = await claudeLimits(config);
    } catch (e) {
      result.limits = null;
      result.limitsError = e.message;
    }
  }
  return result;
}

function add(map, key, base, v) {
  const row = map.get(key) ?? {
    ...base,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    requests: 0,
    webSearches: 0,
  };
  row.input += v.input;
  row.output += v.output;
  row.cacheRead += v.cacheRead;
  row.cacheWrite += v.cacheWrite;
  row.cacheWrite1h += v.cacheWrite1h;
  row.webSearches += v.webSearches;
  row.requests += 1;
  map.set(key, row);
}

/**
 * 구독 요금제의 남은 한도(5시간, 주간)는 Claude Code의 /usage 화면과 같은 계정 사용량 API에서 읽는다.
 * 이 맥에 저장된 Claude Code 로그인 토큰을 읽기만 하고(갱신하지 않음), 결과 숫자만 대시보드로 보낸다.
 */
async function claudeLimits(config) {
  const stateFile = path.join(config.stateDir, "claude-limits.json");
  const cached = readJSON(stateFile, null);
  if (cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < LIMITS_TTL) return cached;

  let cred = readCredentials();
  if (!cred?.accessToken) throw new Error("Claude Code 로그인 정보를 찾지 못했어요. 터미널에서 claude로 로그인했는지 확인하세요.");
  if (cred.expiresAt && cred.expiresAt < Date.now() + 5 * 60 * 1000 && config.refreshClaudeLogin) {
    if (await refreshViaCli(config)) cred = readCredentials() ?? cred;
  }
  if (cred.expiresAt && cred.expiresAt < Date.now()) {
    throw new Error("Claude Code CLI 로그인 토큰이 만료됐어요. 터미널에서 claude를 한 번 실행하면 갱신돼요.");
  }
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "schedulemg-agent/1.0",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Claude 사용량 조회 실패 (HTTP ${res.status})`);
  const data = await res.json();

  const windows = [];
  const push = (id, label, minutes) => {
    const w = data?.[id];
    if (w && typeof w.utilization === "number") {
      windows.push({ id, label, usedPercent: w.utilization, windowMinutes: minutes, resetsAt: w.resets_at ?? null });
    }
  };
  push("five_hour", "5시간", 300);
  push("seven_day", "주간", 10080);
  push("seven_day_opus", "주간 Opus", 10080);
  push("seven_day_sonnet", "주간 Sonnet", 10080);
  if (!windows.length) throw new Error("사용량 응답에서 한도 정보를 찾지 못했어요.");

  const limits = { source: "Claude 계정 사용량", fetchedAt: new Date().toISOString(), plan: cred.subscriptionType ?? null, windows };
  writeJSON(stateFile, limits);
  return limits;
}

export function findClaudeBinary() {
  const candidates = [
    process.env.CLAUDE_BIN,
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    path.join(homedir(), ".local", "bin", "claude"),
    path.join(homedir(), ".claude", "local", "claude"),
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

/**
 * 데스크톱 앱만 쓰면 CLI 로그인 토큰이 갱신되지 않아 한도 조회가 멈춘다.
 * 그래서 CLI를 없는 모델 이름으로 한 번 실행한다: CLI가 스스로 토큰을 갱신해 키체인에 저장하고,
 * 모델 호출은 바로 실패하므로 사용량은 쓰지 않는다. 토큰을 직접 다루지 않고 CLI에 맡긴다.
 */
async function refreshViaCli(config) {
  const stateFile = path.join(config.stateDir, "claude-refresh.json");
  const last = readJSON(stateFile, {}).at ?? 0;
  if (Date.now() - last < REFRESH_COOLDOWN) return false;
  writeJSON(stateFile, { at: Date.now() });
  const bin = findClaudeBinary();
  if (!bin) return false;

  const cwd = path.join(config.stateDir, "claude-refresh");
  mkdirSync(cwd, { recursive: true });
  try {
    await execFileAsync(bin, ["-p", "ping", "--model", "schedulemg-token-refresh", "--max-turns", "1"], {
      cwd,
      timeout: 60_000,
      env: {
        HOME: homedir(),
        USER: process.env.USER ?? "",
        LOGNAME: process.env.LOGNAME ?? process.env.USER ?? "",
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        TERM: "dumb",
      },
    });
  } catch {
    // 없는 모델이라 오류로 끝나는 게 정상이다.
  }
  cleanRefreshSessions(cwd);
  return true;
}

// 갱신용 실행이 남긴 세션 기록은 하루가 지나면 지운다 (이 전용 폴더만 건드린다).
function cleanRefreshSessions(cwd) {
  const dir = path.join(homedir(), ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  try {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (name.endsWith(".jsonl") && Date.now() - statSync(file).mtimeMs > DAY) rmSync(file, { force: true });
    }
  } catch {
    // 폴더가 없으면 넘어간다.
  }
}

function readCredentials() {
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("/usr/bin/security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      const json = JSON.parse(out.trim());
      if (json?.claudeAiOauth?.accessToken) return json.claudeAiOauth;
    } catch {
      // 키체인에 없으면 파일을 본다.
    }
  }
  for (const file of [path.join(homedir(), ".claude", ".credentials.json"), path.join(homedir(), ".config", "claude", ".credentials.json")]) {
    const json = readJSON(file, null);
    if (json?.claudeAiOauth?.accessToken) return json.claudeAiOauth;
  }
  return null;
}
