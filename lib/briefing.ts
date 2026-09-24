import type { CalEvent } from "./google/calendar";
import type { Assignment } from "./google/classroom";
import type { MailItem } from "./google/gmail";
import type { MacNote } from "./mac-data";
import type { Memo } from "./memos";
import type { NotificationItem } from "./notifications";
import { clampText, josa } from "./text";
import {
  DAY,
  dateKey,
  dayLabel,
  formatLongDate,
  formatRelative,
  formatTime,
  formatWhen,
  greeting,
  shiftDateKey,
  startOfDay,
} from "./time";
import type { UsageView } from "./usage/summary";

export type Tone = "urgent" | "soon" | "normal";

export type ToggleAction =
  | { type: "check"; key: string }
  | { type: "memo"; id: string }
  | { type: "notification"; id: string };

export interface RememberItem {
  key: string;
  kind: "assignment" | "memo" | "notification" | "mail" | "usage";
  tone: Tone;
  title: string;
  context: string;
  when?: string;
  href?: string;
  /** 어느 Google 계정에서 왔는지 (이메일) */
  account?: string;
  done: boolean;
  toggle: ToggleAction | null;
}

export interface BriefingInput {
  now: Date;
  /** null이면 아직 연결되지 않았거나 불러오지 못한 것 */
  events: CalEvent[] | null;
  assignments: Assignment[] | null;
  mail: MailItem[] | null;
  notifications: NotificationItem[] | null;
  memos: Memo[] | null;
  usage: UsageView | null;
  checks: Record<string, string>;
  /** 맥 메모 앱 메모 (체크하지 않은 체크리스트 항목을 세는 데 쓴다) */
  macNotes?: MacNote[] | null;
}

export interface Briefing {
  greeting: string;
  dateLabel: string;
  headline: string;
  lines: string[];
  speech: string;
  items: RememberItem[];
  upcomingMemos: Memo[];
  todayEvents: CalEvent[];
  dueToday: Assignment[];
  counts: { events: number; dueToday: number; overdue: number; mail: number; notes: number; memos: number };
}

/** key(YYYY-MM-DD) 날짜에 걸친 일정. 종일 일정이 먼저 온다. */
export function eventsOnDay(events: CalEvent[], key: string): CalEvent[] {
  const start = startOfDay(key).getTime();
  const end = start + DAY;
  return events
    .filter((e) => Date.parse(e.start) < end && Date.parse(e.end) > start)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

const dueMs = (a: Assignment) => Date.parse(a.due!);
const byDue = (a: Assignment, b: Assignment) => dueMs(a) - dueMs(b);

export function buildBriefing(input: BriefingInput): Briefing {
  const { now, checks } = input;
  const nowMs = now.getTime();
  const today = dateKey(now);
  const tomorrow = shiftDateKey(today, 1);
  const isChecked = (key: string) => Boolean(checks[key]);
  const checkedToday = (key: string) => Boolean(checks[key]) && dateKey(new Date(checks[key])) === today;

  const todayEvents = eventsOnDay(input.events ?? [], today);
  // 공휴일은 '일정'으로 세지 않고 따로 알려 준다.
  const holidayNames = [...new Set(todayEvents.filter((e) => e.holiday).map((e) => e.title))];
  const regularEvents = todayEvents.filter((e) => !e.holiday);
  const timed = regularEvents.filter((e) => !e.allDay);
  const current = timed.find((e) => Date.parse(e.start) <= nowMs && Date.parse(e.end) > nowMs);
  const next = timed.find((e) => Date.parse(e.start) > nowMs);
  const anyStarted = timed.some((e) => Date.parse(e.start) <= nowMs);

  const pending = (input.assignments ?? []).filter((a) => !a.submitted && a.due && !isChecked(`cw:${a.id}`));
  const overdue = pending.filter((a) => dueMs(a) < nowMs).sort(byDue).reverse();
  const dueToday = pending.filter((a) => dueMs(a) >= nowMs && dateKey(new Date(dueMs(a))) === today).sort(byDue);
  const dueTomorrow = pending.filter((a) => dateKey(new Date(dueMs(a))) === tomorrow).sort(byDue);

  // Claude 요약이 있으면 그 판단을 따르고, 없으면 Gmail의 중요 표시를 쓴다.
  // 마감이 남은 중요 메일은 읽었어도 마감 전까지 남겨 둔다.
  const mailDue = (m: MailItem) => (m.insight?.due ? Date.parse(m.insight.due) : NaN);
  const importantMail = (input.mail ?? [])
    .filter((m) => {
      if (isChecked(`mail:${m.id}`)) return false;
      const age = nowMs - Date.parse(m.date);
      if (m.insight) {
        if (!m.insight.important) return false;
        const due = mailDue(m);
        if (Number.isFinite(due) && due > nowMs && due - nowMs < 7 * DAY) return true;
        return m.unread && age < 3 * DAY;
      }
      return m.unread && (m.important || m.starred) && age < DAY;
    })
    .sort((a, b) => {
      const da = mailDue(a);
      const db = mailDue(b);
      if (Number.isFinite(da) || Number.isFinite(db)) return (Number.isFinite(da) ? da : Infinity) - (Number.isFinite(db) ? db : Infinity);
      return b.date.localeCompare(a.date);
    });
  const notes = (input.notifications ?? []).filter((n) => n.status === "open" && n.importance === "high");
  const memos = (input.memos ?? []).filter((m) => !m.doneAt && (!m.date || m.date <= today));
  const upcomingMemos = (input.memos ?? []).filter((m) => !m.doneAt && m.date && m.date > today);

  // 한 문장 요약
  const eventsKnown = input.events !== null;
  const nE = regularEvents.length;
  const nD = dueToday.length;
  const holidayText = holidayNames.join(", ");
  let headline: string;
  let holidayInHeadline = false;
  if (!eventsKnown && input.assignments === null) {
    headline = "Google 계정을 연결하면 오늘 일정과 과제를 정리해 드릴게요.";
  } else if (!nE && !nD && holidayText) {
    headline = `오늘은 ${holidayText}${josa.ieyo(holidayText)}. 정해진 일정은 없어요.`;
    holidayInHeadline = true;
  } else if (nE && nD) {
    headline = `오늘은 일정 ${nE}개가 있고, 과제 ${nD}개가 오늘 마감이에요.`;
  } else if (nE) {
    headline = `오늘은 일정 ${nE}개가 있어요.`;
  } else if (nD) {
    headline = eventsKnown ? `오늘은 일정이 없고, 과제 ${nD}개가 오늘 마감이에요.` : `과제 ${nD}개가 오늘 마감이에요.`;
  } else {
    headline = "오늘은 정해진 일정이 없어요.";
  }

  // 이어지는 설명 문장
  const lines: string[] = [];
  if (holidayText && !holidayInHeadline) lines.push(`오늘은 ${holidayText}${josa.ieyo(holidayText)}.`);
  if (overdue.length) lines.push(`기한이 지난 과제 ${overdue.length}개를 먼저 확인하세요.`);
  if (current) {
    lines.push(`지금은 ‘${current.title}’ 시간이에요. ${formatTime(new Date(current.end))}에 끝나요.`);
  } else if (next) {
    lines.push(
      `${anyStarted ? "다음" : "첫"} 일정은 ${formatTime(new Date(next.start))} ‘${next.title}’${josa.ieyo(next.title)}.`,
    );
  } else if (timed.length) {
    lines.push("오늘 일정은 모두 끝났어요.");
  }
  if (dueToday.length) {
    const a = dueToday[0];
    lines.push(`가장 급한 과제는 ${formatTime(new Date(a.due!))} 마감인 ‘${a.title}’${josa.ieyo(a.title)}.`);
  } else if (dueTomorrow.length) {
    lines.push(`내일 마감인 과제가 ${dueTomorrow.length}개 있어요.`);
  }
  if (importantMail.length) {
    const top = importantMail[0];
    lines.push(
      `챙겨야 할 메일이 ${importantMail.length}통 있어요.${top.insight?.summary ? ` ‘${top.subject}’: ${top.insight.summary}` : ""}`,
    );
  }
  if (notes.length && memos.length) lines.push(`기억할 알림 ${notes.length}개와 메모 ${memos.length}개가 있어요.`);
  else if (notes.length) lines.push(`기억할 알림이 ${notes.length}개 있어요.`);
  else if (memos.length) lines.push(`오늘 챙길 메모가 ${memos.length}개 있어요.`);
  const openChecklist = (input.macNotes ?? []).reduce((s, n) => s + n.openItems.length, 0);
  if (openChecklist) lines.push(`맥 메모에 아직 체크하지 않은 항목이 ${openChecklist}개 있어요.`);

  const hotWindows = [input.usage?.claude, input.usage?.codex].flatMap((p) =>
    p?.limits
      ? p.limits.windows
          .filter((w) => !w.hasReset && w.usedPercent >= 80)
          .map((w) => ({ provider: p.provider, name: p.name, window: w }))
      : [],
  );
  for (const { name, window: w } of hotWindows) {
    lines.push(
      `${name} ${w.label} 한도를 ${Math.round(w.usedPercent)}% 썼어요.${w.resetIn ? ` ${w.resetIn} 뒤에 초기화돼요.` : ""}`,
    );
  }

  // 잊지 말 것 목록: 급한 순서대로
  const items: RememberItem[] = [];
  const assignmentItem = (a: Assignment, tone: RememberItem["tone"], when: string): RememberItem => ({
    key: `cw:${a.id}`,
    kind: "assignment",
    tone,
    title: a.title,
    context: a.course,
    when,
    href: a.link,
    account: a.account,
    done: false,
    toggle: { type: "check", key: `cw:${a.id}` },
  });
  for (const a of overdue) items.push(assignmentItem(a, "urgent", `${formatWhen(new Date(a.due!), now)} 마감 지남`));
  for (const a of dueToday) items.push(assignmentItem(a, "urgent", `오늘 ${formatTime(new Date(a.due!))} 마감`));
  for (const m of memos) {
    const late = Boolean(m.date && m.date < today);
    items.push({
      key: `memo:${m.id}`,
      kind: "memo",
      tone: late ? "urgent" : "soon",
      title: m.text,
      context: late ? `${dayLabel(startOfDay(m.date!), now)}부터 미룬 메모` : "",
      done: false,
      toggle: { type: "memo", id: m.id },
    });
  }
  for (const n of notes) {
    items.push({
      key: `note:${n.id}`,
      kind: "notification",
      tone: "soon",
      title: n.title || clampText(n.body, 80),
      context: n.title && n.body ? `${n.appName}: ${clampText(n.body, 70)}` : n.appName,
      when: formatRelative(new Date(n.receivedAt), now),
      href: n.url,
      done: false,
      toggle: { type: "notification", id: n.id },
    });
  }
  for (const m of importantMail) {
    const due = mailDue(m);
    const hasDue = Number.isFinite(due);
    items.push({
      key: `mail:${m.id}`,
      kind: "mail",
      tone: hasDue && due - nowMs < DAY ? "urgent" : hasDue ? "soon" : "normal",
      title: m.subject,
      context: m.insight?.summary || m.from,
      when: hasDue ? `${formatWhen(new Date(due), now)} 마감` : formatTime(new Date(m.date)),
      href: m.link,
      account: m.account,
      done: false,
      toggle: { type: "check", key: `mail:${m.id}` },
    });
  }
  for (const a of dueTomorrow) items.push(assignmentItem(a, "normal", `내일 ${formatTime(new Date(a.due!))} 마감`));
  for (const { provider, name, window: w } of hotWindows) {
    items.push({
      key: `usage:${provider}:${w.id}`,
      kind: "usage",
      tone: w.level === "critical" ? "urgent" : "normal",
      title: `${name} ${w.label} 한도 ${Math.round(w.usedPercent)}% 사용`,
      context: w.resetIn ? `${w.resetIn} 뒤 초기화` : "사용량",
      done: false,
      toggle: null,
    });
  }

  // 급한 것부터 (같은 급함 안에서는 넣은 순서 유지)
  const rank = { urgent: 0, soon: 1, normal: 2 } as const;
  items.sort((a, b) => rank[a.tone] - rank[b.tone]);

  // 오늘 끝낸 항목은 아래에 흐리게 남겨 둔다.
  for (const a of input.assignments ?? []) {
    if (checkedToday(`cw:${a.id}`)) items.push({ ...assignmentItem(a, "normal", "확인함"), done: true });
  }
  for (const m of input.mail ?? []) {
    if (checkedToday(`mail:${m.id}`)) {
      items.push({
        key: `mail:${m.id}`,
        kind: "mail",
        tone: "normal",
        title: m.subject,
        context: m.from,
        href: m.link,
        account: m.account,
        done: true,
        toggle: { type: "check", key: `mail:${m.id}` },
      });
    }
  }
  for (const m of input.memos ?? []) {
    if (m.doneAt && dateKey(new Date(m.doneAt)) === today) {
      items.push({
        key: `memo:${m.id}`,
        kind: "memo",
        tone: "normal",
        title: m.text,
        context: "메모",
        done: true,
        toggle: { type: "memo", id: m.id },
      });
    }
  }
  for (const n of input.notifications ?? []) {
    if (n.status === "done" && n.importance === "high" && n.updatedAt && dateKey(new Date(n.updatedAt)) === today) {
      items.push({
        key: `note:${n.id}`,
        kind: "notification",
        tone: "normal",
        title: n.title || clampText(n.body, 80),
        context: n.appName,
        done: true,
        toggle: { type: "notification", id: n.id },
      });
    }
  }

  const dateLabel = formatLongDate(now);
  const hello = greeting(now);
  return {
    greeting: hello,
    dateLabel,
    headline,
    lines,
    speech: [`${hello}. 오늘은 ${dateLabel}${josa.ieyo(dateLabel)}.`, headline, ...lines].join(" "),
    items,
    upcomingMemos,
    todayEvents,
    dueToday,
    counts: {
      events: nE,
      dueToday: nD,
      overdue: overdue.length,
      mail: importantMail.length,
      notes: notes.length,
      memos: memos.length,
    },
  };
}
