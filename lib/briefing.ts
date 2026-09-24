import type { CalEvent } from "./google/calendar";
import type { Assignment } from "./google/classroom";
import type { MailItem } from "./google/gmail";
import { findDue } from "./mail-rules";
import type { Memo } from "./memos";
import type { NotificationItem } from "./notifications";
import { clampText } from "./text";
import { DAY, dateKey, dayDiff, formatClock, formatRelative, formatShortDate, shiftDateKey, startOfDay } from "./time";

export type Tone = "urgent" | "soon" | "normal";

export type ToggleAction =
  | { type: "check"; key: string }
  | { type: "memo"; id: string }
  | { type: "notification"; id: string };

export interface TodoItem {
  key: string;
  kind: "assignment" | "mail" | "notification" | "memo";
  tone: Tone;
  title: string;
  /** 과목, 보낸 사람, 앱 이름 */
  context: string;
  /** 마감이나 받은 때 (짧게) */
  when?: string;
  overdue?: boolean;
  href?: string;
  toggle: ToggleAction;
}

export interface BriefingInput {
  now: Date;
  /** null이면 아직 연결되지 않았거나 불러오지 못한 것 */
  events: CalEvent[] | null;
  assignments: Assignment[] | null;
  mail: MailItem[] | null;
  notifications: NotificationItem[] | null;
  memos: Memo[] | null;
  checks: Record<string, string>;
}

export interface Briefing {
  /** 할 일: 마감 지남 → 오늘 마감 → 마감 없는 것 → 이번 주 마감 */
  todo: TodoItem[];
  /** 일주일 뒤부터 2주 안의 마감 */
  later: TodoItem[];
  /** 오늘 체크한 항목 (다시 되돌릴 수 있게) */
  done: TodoItem[];
  /** 오늘 일정. 과제 마감(수업 캘린더)은 할 일로 보내고, 종일·공휴일이 먼저 온다. */
  today: CalEvent[];
  tomorrow: CalEvent[];
  current: CalEvent | null;
  next: CalEvent | null;
  counts: { events: number; overdue: number; dueToday: number };
  eventsKnown: boolean;
}

/** key(YYYY-MM-DD) 날짜에 걸친 일정. 종일 일정이 먼저 온다. */
export function eventsOnDay(events: CalEvent[], key: string): CalEvent[] {
  const start = startOfDay(key).getTime();
  const end = start + DAY;
  return events
    .filter((e) => Date.parse(e.start) < end && Date.parse(e.end) > start)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

/** 오늘 18:00, 내일까지, 9월 28일 (월) 23:59 */
export function dueText(at: Date, allDay: boolean, now: Date = new Date()): string {
  const d = dayDiff(at, now);
  const day = d === 0 ? "오늘" : d === 1 ? "내일" : d === 2 ? "모레" : d === -1 ? "어제" : formatShortDate(at);
  return allDay ? `${day}까지` : `${day} ${formatClock(at)}`;
}

const CALENDAR_APP = /ical|calendar|캘린더|fantastical/i;
const MESSENGER_APP = /kakao|카카오|mobilesms|ichat|메시지|messages|slack|discord|telegram|naver\.line|whatsapp|instagram|messenger|teams|signal/i;

interface Draft extends Omit<TodoItem, "tone" | "when" | "overdue"> {
  dueAt?: number;
  allDay?: boolean;
  /** 마감이 없을 때 보여 줄 때 (예: 25분 전) */
  since?: string;
  late?: boolean;
}

export function buildBriefing(input: BriefingInput): Briefing {
  const { now, checks } = input;
  const nowMs = now.getTime();
  const today = dateKey(now);
  const tomorrowKey = shiftDateKey(today, 1);
  const todayStart = startOfDay(today).getTime();
  const isChecked = (key: string) => Boolean(checks[key]);
  const checkedToday = (key: string) => Boolean(checks[key]) && dateKey(new Date(checks[key])) === today;
  const drafts: Draft[] = [];
  const done: TodoItem[] = [];

  // 과제 마감: 클래스룸 권한이 있으면 과제를 직접, 없으면 수업 캘린더(클래스룸이 만든 캘린더)의 일정을 쓴다.
  if (input.assignments?.length) {
    for (const a of input.assignments) {
      const key = `cw:${a.id}`;
      const item: Draft = {
        key,
        kind: "assignment",
        title: a.title,
        context: a.course,
        href: a.link,
        toggle: { type: "check", key },
        dueAt: a.due ? Date.parse(a.due) : undefined,
        allDay: !a.dueHasTime,
      };
      if (checkedToday(key)) done.push(finish(item, now));
      else if (!a.submitted && a.due && !isChecked(key)) drafts.push(item);
    }
  } else {
    for (const e of input.events ?? []) {
      if (!e.classroom || e.holiday) continue;
      const key = `cal:${e.id}`;
      // 종일 마감은 그날 23:59까지로 본다.
      const dueAt = e.allDay ? Date.parse(e.end) - 60_000 : Date.parse(e.start);
      const item: Draft = { key, kind: "assignment", title: e.title, context: e.calendar, href: e.link, toggle: { type: "check", key }, dueAt, allDay: e.allDay };
      if (checkedToday(key)) done.push(finish(item, now));
      // 지난 날의 마감은 제출했는지 알 수 없어서 오늘부터만 보여 준다.
      else if (!isChecked(key) && dueAt >= todayStart) drafts.push(item);
    }
  }

  // 규칙으로 고른 메일: 마감이 2주 안에 있거나, 이틀 안에 받은 안 읽은 메일
  for (const m of input.mail ?? []) {
    const key = `mail:${m.id}`;
    const due = m.flag?.due ? Date.parse(m.flag.due) : NaN;
    const hasDue = Number.isFinite(due) && due > nowMs - DAY && due < nowMs + 14 * DAY;
    const item: Draft = {
      key,
      kind: "mail",
      title: m.subject,
      context: m.from,
      href: m.link,
      toggle: { type: "check", key },
      dueAt: hasDue ? due : undefined,
      since: formatRelative(new Date(m.date), now),
    };
    if (checkedToday(key)) done.push(finish(item, now));
    else if (m.flag?.important && !isChecked(key) && (hasDue || (m.unread && nowMs - Date.parse(m.date) < 2 * DAY))) drafts.push(item);
  }

  // 중요한 알림. '오늘 밤 10시까지' 같은 말이 있으면 마감으로 본다.
  // 캘린더 앱 알림은 오늘 일정과 겹치므로 뺀다.
  for (const n of input.notifications ?? []) {
    const app = `${n.app} ${n.appName}`;
    if (n.importance !== "high" || CALENDAR_APP.test(app)) continue;
    const text = `${n.title} ${n.body}`;
    const due = findDue(text, new Date(n.receivedAt))?.getTime();
    // 메신저는 제목이 보낸 사람·방 이름이라 본문을 앞에 둔다.
    const bodyFirst = Boolean(n.title && n.body) && MESSENGER_APP.test(app);
    const item: Draft = {
      key: `note:${n.id}`,
      kind: "notification",
      title: bodyFirst ? clampText(n.body, 90) : n.title || clampText(n.body, 90),
      context: bodyFirst ? `${n.appName} · ${n.title}` : n.title && n.body ? `${n.appName} · ${clampText(n.body, 60)}` : n.appName,
      href: n.url,
      toggle: { type: "notification", id: n.id },
      dueAt: due && due > nowMs - DAY && due < nowMs + 14 * DAY ? due : undefined,
      since: formatRelative(new Date(n.receivedAt), now),
    };
    if (n.status === "open") drafts.push(item);
    else if (n.status === "done" && n.updatedAt && dateKey(new Date(n.updatedAt)) === today) done.push(finish(item, now));
  }

  // 내 메모. 날짜를 정한 메모는 그날부터 보인다.
  for (const m of input.memos ?? []) {
    const due = findDue(m.text, new Date(m.createdAt))?.getTime();
    const item: Draft = {
      key: `memo:${m.id}`,
      kind: "memo",
      title: m.text,
      context: "메모",
      toggle: { type: "memo", id: m.id },
      dueAt: due && due > nowMs - DAY ? due : undefined,
      late: Boolean(m.date && m.date < today),
    };
    if (!m.doneAt && (!m.date || m.date <= today)) drafts.push(item);
    else if (m.doneAt && dateKey(new Date(m.doneAt)) === today) done.push(finish(item, now));
  }

  // 급한 순서: 마감 지남 → 오늘 마감 → 마감 없는 것 → 내일부터 일주일 → (접어 둘) 그 뒤
  const group = (d: Draft) => {
    if (d.dueAt === undefined) return 2;
    if (d.dueAt < nowMs) return 0;
    if (dateKey(new Date(d.dueAt)) === today) return 1;
    return d.dueAt < nowMs + 7 * DAY ? 3 : 4;
  };
  const kindOrder = { memo: 0, notification: 1, mail: 2, assignment: 3 } as const;
  drafts.sort((a, b) => group(a) - group(b) || (a.dueAt ?? 0) - (b.dueAt ?? 0) || kindOrder[a.kind] - kindOrder[b.kind]);
  const items = drafts.map((d) => ({ draft: d, item: finish(d, now) }));

  // 오늘 일정
  const todayEvents = eventsOnDay(input.events ?? [], today).filter((e) => !e.classroom);
  const timed = todayEvents.filter((e) => !e.allDay && !e.holiday);
  const current = timed.find((e) => Date.parse(e.start) <= nowMs && Date.parse(e.end) > nowMs) ?? null;
  const next = timed.find((e) => Date.parse(e.start) > nowMs) ?? null;

  return {
    todo: items.filter(({ draft }) => group(draft) < 4).map(({ item }) => item),
    later: items.filter(({ draft }) => group(draft) === 4).map(({ item }) => item),
    done,
    today: todayEvents,
    tomorrow: eventsOnDay(input.events ?? [], tomorrowKey).filter((e) => !e.classroom),
    current,
    next,
    counts: {
      events: todayEvents.filter((e) => !e.holiday).length,
      overdue: items.filter(({ draft }) => group(draft) === 0).length,
      dueToday: items.filter(({ draft }) => group(draft) === 1).length,
    },
    eventsKnown: input.events !== null,
  };
}

function finish(d: Draft, now: Date): TodoItem {
  const nowMs = now.getTime();
  let tone: Tone = d.late ? "soon" : "normal";
  let when = d.since;
  let overdue = false;
  if (d.dueAt !== undefined) {
    const at = new Date(d.dueAt);
    const diff = dayDiff(at, now);
    overdue = d.dueAt < nowMs;
    tone = overdue || diff === 0 ? "urgent" : diff === 1 ? "soon" : "normal";
    when = overdue ? `${dueText(at, Boolean(d.allDay), now)} 지남` : dueText(at, Boolean(d.allDay), now);
  }
  return {
    key: d.key,
    kind: d.kind,
    tone,
    title: d.title,
    context: d.context,
    when,
    overdue,
    href: d.href,
    toggle: d.toggle,
  };
}
