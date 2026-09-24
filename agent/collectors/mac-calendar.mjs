import { constants, copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { kstDayStart } from "../lib/time.mjs";

// 맥 캘린더 앱의 로컬 DB에서 오늘부터 며칠치 일정을 읽는다 (iCloud, 구독 캘린더, 공휴일 등).
// 반복 일정은 캘린더 앱이 날짜별로 펼쳐 둔 OccurrenceCache를 쓴다. 전체 디스크 접근 권한이 필요하다.
const MAC_EPOCH = 978307200; // 2001-01-01T00:00:00Z (초)
const DB = path.join(homedir(), "Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb");
/** 바뀌었는지 지켜볼 파일 (새 내용은 먼저 -wal 파일에 쓰인다) */
export const MAC_CALENDAR_FILES = [DB, `${DB}-wal`];
// Siri 제안으로 만들어진 캘린더와 미리 알림은 일정이 아니다.
const SKIP = /^(Default|Found in Mail|Found in Natural Language|Scheduled Reminders|메일에서 찾음|자연어에서 찾음)$/i;
const HOLIDAY = /공휴일|휴일|holiday/i;

const toIso = (t) => new Date((t + MAC_EPOCH) * 1000).toISOString();

export async function collectMacCalendar(now = Date.now(), days = 3) {
  if (process.platform !== "darwin") return null;
  if (!existsSync(DB)) return { available: false, error: "맥 캘린더 데이터베이스를 찾지 못했어요.", events: [] };
  const { DatabaseSync } = await import("node:sqlite");

  const tmp = mkdtempSync(path.join(tmpdir(), "schedulemg-cal-"));
  let rows;
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(DB + suffix)) copyFileSync(DB + suffix, path.join(tmp, `db${suffix}`), constants.COPYFILE_FICLONE);
    }
    const db = new DatabaseSync(path.join(tmp, "db"));
    const from = kstDayStart(now) / 1000 - MAC_EPOCH;
    try {
      rows = db
        .prepare(
          `SELECT oc.event_id AS id, oc.day AS day, oc.occurrence_date AS occ,
                  oc.occurrence_start_date AS occStart, oc.occurrence_end_date AS occEnd,
                  ci.summary AS title, ci.all_day AS allDay, ci.start_date AS start, ci.end_date AS end,
                  ci.start_tz AS tz, ci.unique_identifier AS uid, ci.hidden AS hidden, ci.status AS status,
                  c.title AS calendar, c.color AS color
           FROM OccurrenceCache oc
           JOIN CalendarItem ci ON ci.ROWID = oc.event_id
           JOIN Calendar c ON c.ROWID = oc.calendar_id
           WHERE oc.day >= ? AND oc.day < ?
           ORDER BY oc.day`,
        )
        .all(from, from + days * 86400);
    } finally {
      db.close();
    }
  } catch (e) {
    const denied = /EPERM|EACCES|not permitted|authorization/i.test(String(e?.message));
    return {
      available: false,
      error: denied ? "캘린더 데이터베이스를 읽을 권한이 없어요. 전체 디스크 접근 권한을 확인하세요." : `맥 캘린더를 읽지 못했어요: ${e?.message ?? e}`,
      events: [],
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const seen = new Set();
  const events = [];
  for (const r of rows) {
    if (r.hidden || r.status === 3 || SKIP.test(String(r.calendar ?? ""))) continue; // 3 = 취소됨
    let start;
    let end;
    if (r.allDay) {
      // 종일 일정의 day는 그날 0시(KST)다.
      start = toIso(r.day ?? r.occ);
      end = toIso((r.day ?? r.occ) + 86400);
    } else {
      let s = r.occStart ?? r.occ;
      let e = r.occEnd ?? s + Math.max(0, (r.end ?? r.start) - r.start);
      if (r.tz === "_float") {
        // 시간대 없는 일정은 벽시계 시각을 UTC처럼 저장하므로 한국 시간으로 옮긴다.
        s -= 9 * 3600;
        e -= 9 * 3600;
      }
      start = toIso(s);
      end = toIso(Math.max(e, s));
    }
    const uid = `${r.uid ?? r.id}:${start}`;
    if (seen.has(uid)) continue;
    seen.add(uid);
    events.push({
      uid,
      title: String(r.title ?? "").trim() || "(제목 없음)",
      calendar: String(r.calendar ?? "캘린더"),
      color: typeof r.color === "string" && r.color.startsWith("#") ? r.color.slice(0, 7) : "#8e8e93",
      start,
      end,
      allDay: Boolean(r.allDay),
      holiday: HOLIDAY.test(String(r.calendar ?? "")),
    });
  }
  return { available: true, events: events.slice(0, 200) };
}
