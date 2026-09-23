import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const AGENT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PROJECT_DIR = path.dirname(AGENT_DIR);

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch (e) {
    console.warn(`[agent] ${file} 을 읽지 못했어요: ${e.message}`);
    return {};
  }
}

function computerName() {
  if (process.platform === "darwin") {
    try {
      const name = execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], { encoding: "utf8", timeout: 3000 }).trim();
      if (name) return name;
    } catch {
      // hostname으로 대신한다.
    }
  }
  return hostname().replace(/\.local$/, "");
}

// 맥 이름을 바꿔도 같은 맥으로 알아보도록 하드웨어 UUID로 고정 ID를 만든다. UUID 자체는 보내지 않는다.
function machineId() {
  let seed = hostname();
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 3000 });
      seed = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] ?? seed;
    } catch {
      // hostname으로 대신한다.
    }
  }
  return createHash("sha256").update(`schedulemg:${seed}`).digest("hex").slice(0, 16);
}

export function loadConfig() {
  const stateDir = process.env.SCHEDULEMG_STATE_DIR || path.join(homedir(), ".schedulemg");
  // 우선순위: 실제 환경 변수 > agent/.env > ~/.schedulemg/agent.env
  const fileVars = { ...readEnvFile(path.join(stateDir, "agent.env")), ...readEnvFile(path.join(AGENT_DIR, ".env")) };
  const get = (key) => process.env[key] ?? fileVars[key];

  // 대시보드를 이 맥에서 직접 띄운 경우: 프로젝트 .env.local의 INGEST_TOKEN만 빌려 쓴다.
  let ingestToken = get("INGEST_TOKEN") || "";
  if (!ingestToken) ingestToken = readEnvFile(path.join(PROJECT_DIR, ".env.local")).INGEST_TOKEN || "";

  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  return {
    dashboardUrl: (get("DASHBOARD_URL") || "http://localhost:3300").replace(/\/$/, ""),
    ingestToken,
    host: get("AGENT_HOST_NAME") || computerName(),
    hostId: machineId(),
    liveLimits: get("AGENT_LIVE_LIMITS") !== "0",
    refreshClaudeLogin: get("AGENT_REFRESH_CLAUDE_LOGIN") !== "0",
    macNotifications: get("AGENT_MAC_NOTIFICATIONS") !== "0",
    intervalSec: Math.max(30, Number(get("AGENT_INTERVAL")) || 120),
    stateDir,
  };
}
