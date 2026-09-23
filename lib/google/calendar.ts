import { mapLimit } from "../concurrency";
import { TIME_ZONE, shiftDateKey, startOfDay } from "../time";
import type { GoogleAccount } from "./accounts";
import { gget } from "./client";

export interface CalEvent {
  id: string;
  uid: string;
  account: string;
  calendar: string;
  color: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  link?: string;
  meetLink?: string;
}

interface CalendarListResponse {
  items?: {
    id: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    selected?: boolean;
    hidden?: boolean;
  }[];
}

interface GEvent {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

const BASE = "https://www.googleapis.com/calendar/v3";

/** fromKey(YYYY-MM-DD)부터 days일 동안의 일정. Google 캘린더에서 숨긴 캘린더는 뺀다. */
export async function fetchEvents(account: GoogleAccount, fromKey: string, days: number): Promise<CalEvent[]> {
  const list = await gget<CalendarListResponse>(
    account,
    `${BASE}/users/me/calendarList?minAccessRole=reader&maxResults=100`,
  );
  const calendars = (list.items ?? []).filter((c) => c.selected !== false && !c.hidden);
  const timeMin = startOfDay(fromKey).toISOString();
  const timeMax = startOfDay(shiftDateKey(fromKey, days)).toISOString();

  const perCalendar = await mapLimit(calendars, 6, async (cal) => {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
      timeZone: TIME_ZONE,
    });
    const res = await gget<{ items?: GEvent[] }>(
      account,
      `${BASE}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
    );
    return (res.items ?? [])
      .filter((e) => e.status !== "cancelled" && e.start && (e.start.date || e.start.dateTime))
      .filter((e) => !e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
      .filter((e) => e.eventType !== "workingLocation")
      .map((e) => toEvent(account.email, cal.summaryOverride ?? cal.summary ?? "캘린더", cal.backgroundColor, e));
  });
  return perCalendar.flat();
}

function toEvent(account: string, calendar: string, color: string | undefined, e: GEvent): CalEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  const start = allDay
    ? startOfDay(e.start!.date!).toISOString()
    : new Date(e.start!.dateTime!).toISOString();
  const end = allDay
    ? startOfDay(e.end?.date ?? shiftDateKey(e.start!.date!, 1)).toISOString()
    : new Date(e.end?.dateTime ?? e.start!.dateTime!).toISOString();
  return {
    id: `${account}:${e.id}`,
    uid: e.iCalUID ?? e.id,
    account,
    calendar,
    color: color ?? "#4f7fd9",
    title: e.summary?.trim() || "(제목 없음)",
    start,
    end,
    allDay,
    location: e.location,
    link: e.htmlLink,
    meetLink: e.hangoutLink,
  };
}

/** 여러 계정에 같은 일정이 있으면 하나만 남긴다. */
export function dedupeEvents(events: CalEvent[]): CalEvent[] {
  const seen = new Set<string>();
  return events
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
    .filter((e) => {
      const key = `${e.uid}|${e.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
