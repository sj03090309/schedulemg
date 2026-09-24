import { execFileSync } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseBplist } from "../lib/bplist.mjs";
import { readJSON, writeJSON } from "../lib/files.mjs";

// 맥 알림 센터 기록은 SQLite(usernoted)에 있고, 알림 센터에서 지우면 기록도 사라진다.
// 그래서 짧은 간격으로 새 알림만 읽어 대시보드로 보낸다. 중요한지 판단은 대시보드 규칙이 한다.
const MAC_EPOCH = 978307200; // 2001-01-01T00:00:00Z (초)
const none = (error) => ({ available: false, error, items: [], commit() {} });

function findDatabase() {
  const candidates = [path.join(homedir(), "Library/Group Containers/group.com.apple.usernoted/db2/db")];
  try {
    const dir = execFileSync("/usr/bin/getconf", ["DARWIN_USER_DIR"], { encoding: "utf8", timeout: 3000 }).trim();
    candidates.push(path.join(dir, "com.apple.notificationcenter/db2/db"));
  } catch {
    // 예전 위치를 못 찾아도 괜찮다.
  }
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** 새 알림이 오면 바뀌는 파일 */
export function macNotificationFiles() {
  const db = process.platform === "darwin" ? findDatabase() : null;
  return db ? [db, `${db}-wal`] : [];
}

export async function collectMacNotifications(config, now = Date.now()) {
  if (process.platform !== "darwin") return none(null);
  const dbPath = findDatabase();
  if (!dbPath) return none("맥 알림 데이터베이스를 찾지 못했어요.");

  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return none("맥 알림을 읽으려면 Node.js 22.5 이상이 필요해요.");
  }

  const stateFile = path.join(config.stateDir, "mac-notifications.json");
  const state = readJSON(stateFile, {});
  // 처음 실행하면 최근 24시간치만 가져온다.
  const since = typeof state.lastDelivered === "number" ? state.lastDelivered : now / 1000 - MAC_EPOCH - 24 * 3600;

  // 알림 센터가 쓰고 있는 파일을 건드리지 않도록 임시 폴더에 복사해서 읽는다.
  const tmp = mkdtempSync(path.join(tmpdir(), "schedulemg-notif-"));
  let rows = [];
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, path.join(tmp, `db${suffix}`), constants.COPYFILE_FICLONE);
    }
    const db = new DatabaseSync(path.join(tmp, "db"));
    try {
      rows = db
        .prepare(
          `SELECT r.rec_id AS id, a.identifier AS app, r.data AS data, r.delivered_date AS delivered
           FROM record r JOIN app a ON a.app_id = r.app_id
           WHERE r.delivered_date > ? ORDER BY r.delivered_date ASC LIMIT 500`,
        )
        .all(since);
    } finally {
      db.close();
    }
  } catch (e) {
    const denied = /EPERM|EACCES|not permitted|authorization/i.test(String(e?.message));
    return none(
      denied
        ? "알림 데이터베이스를 읽을 권한이 없어요. 전체 디스크 접근 권한에 node를 추가하세요."
        : `맥 알림을 읽지 못했어요: ${e?.message ?? e}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  let newest = since;
  const items = [];
  for (const row of rows) {
    const delivered = Number(row.delivered);
    if (delivered > newest) newest = delivered;
    let plist;
    try {
      plist = parseBplist(Buffer.from(row.data));
    } catch {
      continue;
    }
    const req = plist?.req ?? {};
    const title = text(req.titl);
    const subtitle = text(req.subt);
    const body = text(req.body);
    if (!title && !body) continue;
    items.push({
      source: "mac",
      app: String(row.app ?? plist?.app ?? ""),
      title,
      subtitle: subtitle || undefined,
      body,
      time: new Date((delivered + MAC_EPOCH) * 1000).toISOString(),
      externalId: `mac:${row.id}:${Math.round(delivered)}`,
    });
  }

  return {
    available: true,
    items,
    // 대시보드에 보낸 뒤에만 기준 시각을 옮긴다. 보내기에 실패하면 다음번에 다시 보낸다.
    commit() {
      writeJSON(stateFile, { lastDelivered: newest });
    },
  };
}

const text = (v) => (typeof v === "string" ? v.trim() : "");
