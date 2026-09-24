import { constants, copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

// 맥 메모 앱(NoteStore.sqlite)에서 대시보드에 보여 줄 메모를 고른다:
// 고정한 메모, 체크리스트가 남은 메모, 최근 7일 안에 고친 메모. 잠긴 메모와 삭제한 메모는 제외한다.
const MAC_EPOCH = 978307200;
const DB = path.join(homedir(), "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite");
/** 바뀌었는지 지켜볼 파일 (새 내용은 먼저 -wal 파일에 쓰인다) */
export const MAC_NOTES_FILES = [DB, `${DB}-wal`];
const MAX_NOTES = 12;
const CHECKBOX = 103; // 메모 앱 문단 스타일: 체크리스트

// ── 아주 작은 protobuf 읽기 (메모 본문은 gzip으로 압축된 protobuf다) ──
function varint(buf, pos) {
  let result = 0;
  let mul = 1;
  for (;;) {
    const b = buf[pos++];
    if (b === undefined) throw new Error("protobuf가 잘렸어요");
    result += (b & 0x7f) * mul;
    if (b < 0x80) return [result, pos];
    mul *= 128;
  }
}

function fields(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    const [key, p1] = varint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) {
      const [value, p2] = varint(buf, p1);
      out.push({ field, value });
      pos = p2;
    } else if (wire === 2) {
      const [len, p2] = varint(buf, p1);
      out.push({ field, bytes: buf.subarray(p2, p2 + len) });
      pos = p2 + len;
    } else if (wire === 1) pos = p1 + 8;
    else if (wire === 5) pos = p1 + 4;
    else throw new Error(`지원하지 않는 protobuf 형식 ${wire}`);
  }
  return out;
}

const first = (list, field) => list.find((f) => f.field === field);

/** 체크하지 않은 체크리스트 항목들 */
export function openChecklistItems(data, limit = 10) {
  const root = fields(gunzipSync(data));
  const doc = first(root, 2);
  const note = doc && first(fields(doc.bytes), 3);
  if (!note) return [];
  const noteFields = fields(note.bytes);
  const text = first(noteFields, 2)?.bytes.toString("utf8") ?? "";
  const runs = noteFields
    .filter((f) => f.field === 5)
    .map((f) => {
      const run = fields(f.bytes);
      const style = first(run, 2) ? fields(first(run, 2).bytes) : [];
      const checklist = first(style, 5) ? fields(first(style, 5).bytes) : [];
      return {
        length: first(run, 1)?.value ?? 0,
        type: first(style, 1)?.value ?? -1,
        done: (first(checklist, 2)?.value ?? 0) === 1,
      };
    });

  // 문단의 첫 글자를 덮는 run의 스타일이 그 문단의 스타일이다. (길이는 UTF-16 단위)
  const items = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    let cursor = 0;
    const run = runs.find((r) => {
      const hit = lineStart >= cursor && lineStart < cursor + r.length;
      cursor += r.length;
      return hit;
    });
    if (run?.type === CHECKBOX && !run.done && line.trim()) items.push(line.trim().slice(0, 120));
    lineStart += line.length + 1;
    if (items.length >= limit) break;
  }
  return items;
}

export async function collectMacNotes(now = Date.now()) {
  if (process.platform !== "darwin") return null;
  if (!existsSync(DB)) return { available: false, error: "메모 데이터베이스를 찾지 못했어요.", items: [] };
  const { DatabaseSync } = await import("node:sqlite");

  const tmp = mkdtempSync(path.join(tmpdir(), "schedulemg-notes-"));
  let rows;
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(DB + suffix)) copyFileSync(DB + suffix, path.join(tmp, `db${suffix}`), constants.COPYFILE_FICLONE);
    }
    const db = new DatabaseSync(path.join(tmp, "db"));
    const recent = now / 1000 - MAC_EPOCH - 7 * 86400;
    try {
      rows = db
        .prepare(
          `SELECT n.Z_PK AS id, n.ZTITLE1 AS title, n.ZSNIPPET AS snippet, n.ZMODIFICATIONDATE1 AS modified,
                  n.ZISPINNED AS pinned, n.ZHASCHECKLISTINPROGRESS AS checklist,
                  f.ZTITLE2 AS folder, d.ZDATA AS data
           FROM ZICCLOUDSYNCINGOBJECT n
           LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON f.Z_PK = n.ZFOLDER
           LEFT JOIN ZICNOTEDATA d ON d.Z_PK = n.ZNOTEDATA
           WHERE n.ZTITLE1 IS NOT NULL AND n.ZNOTEDATA IS NOT NULL
             AND coalesce(n.ZMARKEDFORDELETION, 0) = 0
             AND coalesce(n.ZISPASSWORDPROTECTED, 0) = 0
             AND coalesce(f.ZFOLDERTYPE, 0) != 1
             AND (n.ZISPINNED = 1 OR n.ZHASCHECKLISTINPROGRESS = 1 OR n.ZMODIFICATIONDATE1 > ?)
           ORDER BY n.ZISPINNED DESC, n.ZMODIFICATIONDATE1 DESC
           LIMIT ?`,
        )
        .all(recent, MAX_NOTES);
    } finally {
      db.close();
    }
  } catch (e) {
    const denied = /EPERM|EACCES|not permitted|authorization/i.test(String(e?.message));
    return {
      available: false,
      error: denied ? "메모 데이터베이스를 읽을 권한이 없어요. 전체 디스크 접근 권한을 확인하세요." : `메모를 읽지 못했어요: ${e?.message ?? e}`,
      items: [],
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const items = rows.map((r) => {
    let openItems = [];
    if (r.checklist && r.data) {
      try {
        openItems = openChecklistItems(Buffer.from(r.data));
      } catch {
        // 형식이 달라 못 읽으면 미리보기만 보낸다.
      }
    }
    return {
      id: String(r.id),
      title: String(r.title).trim().slice(0, 120),
      snippet: String(r.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      folder: r.folder ? String(r.folder).slice(0, 60) : null,
      modifiedAt: r.modified ? new Date((r.modified + MAC_EPOCH) * 1000).toISOString() : null,
      pinned: Boolean(r.pinned),
      openItems,
    };
  });
  return { available: true, items };
}
