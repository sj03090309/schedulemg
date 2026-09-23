#!/usr/bin/env node
// 오늘 브리핑 맥 에이전트
//   node agent/index.mjs            한 번 수집해서 보내기
//   node agent/index.mjs --dry-run  보내지 않고 무엇이 수집되는지만 보기
//   node agent/index.mjs --watch    AGENT_INTERVAL(기본 120초)마다 계속 실행
//   node agent/index.mjs --check    대시보드 연결과 저장소 확인
import { statSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { collectClaude } from "./collectors/claude.mjs";
import { collectCodex } from "./collectors/codex.mjs";
import { collectMacNotifications } from "./collectors/mac-notifications.mjs";
import { summarizeMail } from "./collectors/mail-insights.mjs";
import { loadConfig } from "./lib/config.mjs";
import { kstDateKey, kstStamp } from "./lib/time.mjs";

const VERSION = "1.0.0";
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const WATCH = args.has("--watch");
const CHECK = args.has("--check");

const log = (msg) => console.log(`[${kstStamp()}] ${msg}`);

async function safe(label, fn) {
  try {
    return await fn();
  } catch (e) {
    return { available: false, error: `${label} 수집 중 오류: ${e?.message ?? e}`, days: [], items: [], commit() {} };
  }
}

async function send(config, pathname, body) {
  if (!config.ingestToken) throw new Error("INGEST_TOKEN이 없어요. agent/.env 에 대시보드와 같은 토큰을 넣으세요.");
  const res = await fetch(`${config.dashboardUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.ingestToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} 응답 ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const n = (v) => Math.round(v).toLocaleString("ko-KR");

function summarize(name, snap) {
  if (!snap?.available) return `${name}: 없음 (${snap?.error ?? "기록 없음"})`;
  const today = kstDateKey(Date.now());
  let todayTokens = 0;
  let allTokens = 0;
  for (const d of snap.days) {
    const t = d.input + d.output + d.cacheRead + d.cacheWrite + (d.cacheWrite1h ?? 0);
    allTokens += t;
    if (d.date === today) todayTokens += t;
  }
  const lines = [
    `${name}: 기록 파일 ${snap.stats?.files ?? "?"}개 (이번에 새로 읽음 ${snap.stats?.parsed ?? "?"}개), 오늘 ${n(todayTokens)} 토큰, 최근 35일 ${n(allTokens)} 토큰, 최근 모델 ${snap.latestModel ?? "-"}`,
  ];
  if (snap.limits) {
    const w = snap.limits.windows
      .map((x) => `${x.label} ${Math.round(x.usedPercent)}% 사용${x.resetsAt ? ` (초기화 ${kstStamp(Date.parse(x.resetsAt)).slice(5, 16)})` : ""}`)
      .join(", ");
    lines.push(`  남은 한도: ${w} [${snap.limits.source}${snap.limits.plan ? `, ${snap.limits.plan}` : ""}]`);
  } else {
    lines.push(`  남은 한도: 없음${snap.limitsError ? ` (${snap.limitsError})` : ""}`);
  }
  return lines.join("\n");
}

async function runOnce(config) {
  const started = Date.now();
  const [claude, codex] = await Promise.all([
    safe("Claude", () => collectClaude(config)),
    safe("Codex", () => collectCodex(config)),
  ]);
  const notes = config.macNotifications ? await safe("맥 알림", () => collectMacNotifications(config)) : null;
  const report = {
    host: config.host,
    hostId: config.hostId,
    collectedAt: new Date().toISOString(),
    agentVersion: VERSION,
    claude,
    codex,
    // 알림을 못 읽고 있으면 대시보드에 이유를 보여 주기 위해 상태만 같이 보낸다.
    macNotifications: notes ? { available: notes.available, error: notes.error ?? null } : null,
  };

  if (DRY_RUN) {
    console.log(`[미리보기] ${config.host} → ${config.dashboardUrl} (보내지 않음)`);
    console.log(summarize("Claude", claude));
    console.log(summarize("Codex", codex));
    if (notes) {
      if (!notes.available) console.log(`맥 알림: 없음${notes.error ? ` (${notes.error})` : ""}`);
      else {
        const byApp = {};
        for (const i of notes.items) byApp[i.app] = (byApp[i.app] ?? 0) + 1;
        const apps = Object.entries(byApp).map(([a, c]) => `${a} ${c}`).join(", ");
        console.log(`맥 알림: 새 알림 ${notes.items.length}건${apps ? ` (${apps})` : ""}`);
      }
    }
    console.log(`수집 시간 ${Date.now() - started}ms`);
    return;
  }

  await send(config, "/api/ingest/usage", report);
  let noteResult = null;
  if (notes?.available && notes.items.length) {
    noteResult = await send(config, "/api/ingest/notifications", { notifications: notes.items });
  }
  notes?.commit?.();

  let mailText = "";
  try {
    const r = await summarizeMail(config, claude.limits);
    if (r?.count) mailText = `, 메일 요약 ${r.count}통(챙길 메일 ${r.important}통)`;
    else if (r?.deferred) mailText = `, 메일 요약 미룸(${r.deferred})`;
    else if (r?.error) mailText = `, 메일 요약 안 됨(${r.error})`;
  } catch (e) {
    mailText = `, 메일 요약 실패(${e?.message ?? e})`;
  }

  const part = (name, snap) =>
    `${name} ${snap.available ? (snap.limits ? "O" : `O, 한도 없음(${snap.limitsError ?? "기록 없음"})`) : `X(${snap.error})`}`;
  const noteText = !notes
    ? "맥 알림 끔"
    : notes.available
      ? `맥 알림 ${notes.items.length}건${noteResult ? `(기억할 알림 ${noteResult.important ?? 0}건)` : ""}`
      : `맥 알림 읽기 실패(${notes.error})`;
  log(`보냄: ${part("Claude", claude)}, ${part("Codex", codex)}, ${noteText}${mailText} (${Date.now() - started}ms)`);
}

// launchd 로그가 끝없이 커지지 않게 2MB를 넘으면 뒷부분만 남긴다.
function trimLog(config) {
  const file = path.join(config.stateDir, "agent.log");
  try {
    if (statSync(file).size > 2 * 1024 * 1024) {
      const text = readFileSync(file, "utf8");
      writeFileSync(file, text.slice(-200_000));
    }
  } catch {
    // 로그 파일이 없으면 넘어간다.
  }
}

// 대시보드 주소·토큰이 맞는지, 저장소가 어디인지 확인한다.
async function check(config) {
  if (!config.ingestToken) throw new Error("INGEST_TOKEN이 없어요. agent/.env 를 확인하세요.");
  const res = await fetch(`${config.dashboardUrl}/api/ingest/usage`, {
    headers: { authorization: `Bearer ${config.ingestToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${config.dashboardUrl} 응답 ${res.status}: ${body.error ?? "알 수 없는 오류"}`);
  const storage = body.storage === "redis" ? "Upstash Redis" : body.persistent ? "로컬 파일" : "임시 저장소(데이터가 사라질 수 있음)";
  console.log(`연결 성공: ${config.dashboardUrl}`);
  console.log(`저장소: ${storage}`);
  for (const h of body.hosts ?? []) console.log(`마지막 보고: ${h.host} (${kstStamp(Date.parse(h.collectedAt))})`);
  if (!body.hosts?.length) console.log("아직 받은 보고가 없어요. npm run agent 로 한 번 보내 보세요.");
}

async function main() {
  const config = loadConfig();
  if (CHECK) {
    await check(config);
    return;
  }
  trimLog(config);
  if (!WATCH) {
    await runOnce(config);
    return;
  }
  log(`${config.intervalSec}초마다 실행해요. 멈추려면 Ctrl+C.`);
  for (;;) {
    try {
      await runOnce(config);
    } catch (e) {
      log(`실패: ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, config.intervalSec * 1000));
  }
}

main().catch((e) => {
  log(`실패: ${e?.message ?? e}`);
  process.exitCode = 1;
});
