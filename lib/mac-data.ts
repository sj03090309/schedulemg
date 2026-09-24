import { hgetallJSON, hsetJSON } from "./store/kv";

// 맥 에이전트가 보낸 맥 캘린더 일정과 메모 앱 메모. 맥마다 마지막 보고 하나만 둔다.
export interface MacEvent {
  uid: string;
  title: string;
  calendar: string;
  color: string;
  start: string;
  end: string;
  allDay: boolean;
  holiday: boolean;
}

export interface MacNote {
  id: string;
  title: string;
  snippet: string;
  folder: string | null;
  modifiedAt: string | null;
  pinned: boolean;
  /** 체크하지 않은 체크리스트 항목 */
  openItems: string[];
}

export interface MacData {
  host: string;
  hostId?: string;
  collectedAt: string;
  receivedAt: string;
  calendar: { available: boolean; error: string | null; events: MacEvent[] } | null;
  notes: { available: boolean; error: string | null; items: MacNote[] } | null;
}

const KEY = "mac:data";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const iso = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

function event(v: unknown): MacEvent | null {
  if (!isObj(v)) return null;
  const start = iso(v.start);
  const end = iso(v.end) ?? start;
  if (!start || !end) return null;
  const color = str(v.color, 9);
  return {
    uid: str(v.uid, 200) || `${str(v.title, 50)}:${start}`,
    title: str(v.title, 200) || "(제목 없음)",
    calendar: str(v.calendar, 80) || "캘린더",
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#8e8e93",
    start,
    end,
    allDay: v.allDay === true,
    holiday: v.holiday === true,
  };
}

function note(v: unknown): MacNote | null {
  if (!isObj(v)) return null;
  const title = str(v.title, 120).trim();
  if (!title) return null;
  return {
    id: str(v.id, 40) || title,
    title,
    snippet: str(v.snippet, 200),
    folder: str(v.folder, 60) || null,
    modifiedAt: iso(v.modifiedAt),
    pinned: v.pinned === true,
    openItems: (Array.isArray(v.openItems) ? v.openItems : [])
      .filter((i): i is string => typeof i === "string" && Boolean(i.trim()))
      .slice(0, 10)
      .map((i) => i.slice(0, 120)),
  };
}

export function sanitizeMacData(v: unknown): Omit<MacData, "receivedAt"> | null {
  if (!isObj(v)) return null;
  const host = str(v.host, 60).replace(/\s+/g, " ").trim() || "Mac";
  const cal = isObj(v.calendar) ? v.calendar : null;
  const notes = isObj(v.notes) ? v.notes : null;
  return {
    host,
    hostId: str(v.hostId, 40).replace(/[^\w-]/g, "") || undefined,
    collectedAt: iso(v.collectedAt) ?? new Date().toISOString(),
    calendar: cal
      ? {
          available: cal.available === true,
          error: str(cal.error, 200) || null,
          events: (Array.isArray(cal.events) ? cal.events : []).map(event).filter((e): e is MacEvent => e !== null).slice(0, 200),
        }
      : null,
    notes: notes
      ? {
          available: notes.available === true,
          error: str(notes.error, 200) || null,
          items: (Array.isArray(notes.items) ? notes.items : []).map(note).filter((n): n is MacNote => n !== null).slice(0, 20),
        }
      : null,
  };
}

export async function saveMacData(data: Omit<MacData, "receivedAt">): Promise<void> {
  const stored: MacData = { ...data, receivedAt: new Date().toISOString() };
  await hsetJSON(KEY, data.hostId || data.host, stored);
}

/** 가장 최근에 보고한 맥의 데이터 */
export async function loadMacData(): Promise<MacData | null> {
  const all = Object.values(await hgetallJSON<MacData>(KEY));
  return all.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0] ?? null;
}
