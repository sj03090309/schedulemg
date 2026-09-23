import { cache } from "react";
import { buildBriefing, type Briefing } from "./briefing";
import { loadChecks } from "./checks";
import { cached, settle } from "./concurrency";
import {
  DEMO_ACCOUNTS,
  demoClassroom,
  demoEvents,
  demoMail,
  demoMemos,
  demoNotifications,
  demoUsageReports,
} from "./demo";
import { isGoogleConfigured } from "./env";
import { accountTags, listAccounts, type AccountTag, type GoogleAccount } from "./google/accounts";
import { fetchEvents, dedupeEvents, type CalEvent } from "./google/calendar";
import { fetchClassroom, type ClassroomData } from "./google/classroom";
import { describeGoogleError } from "./google/client";
import { fetchMail, type MailItem } from "./google/gmail";
import { grantedServices, type GoogleService } from "./google/oauth";
import { listMemos, type Memo } from "./memos";
import { listNotifications, type NotificationItem } from "./notifications";
import { josa } from "./text";
import { dateKey } from "./time";
import { getUsdKrw } from "./usage/fx";
import { loadUsageReports } from "./usage/store";
import { summarizeUsage, type UsageView } from "./usage/summary";

export type Section<T> =
  | { status: "ok"; data: T; warnings: string[] }
  | { status: "setup"; message: string; action?: { href: string; label: string } }
  | { status: "error"; message: string };

function ok<T>(data: T, warnings: string[] = []): Section<T> {
  return { status: "ok", data, warnings };
}

export const getAccounts = cache(async (): Promise<GoogleAccount[]> => {
  try {
    return await listAccounts();
  } catch (e) {
    console.error("[accounts]", e);
    return [];
  }
});

export const getAccountTags = cache(async (demo: boolean): Promise<Record<string, AccountTag>> => {
  if (demo) return Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.email, a]));
  return accountTags(await getAccounts());
});

type PerAccount<T> = { account: string; value: T }[];

/** 해당 서비스 권한이 있는 모든 계정에서 동시에 불러와 합친다. 한 계정이 실패해도 나머지는 보여 준다. */
async function perAccount<T>(
  service: GoogleService,
  label: string,
  cacheKey: string,
  ttlMs: number,
  load: (account: GoogleAccount) => Promise<T>,
): Promise<Section<PerAccount<T>>> {
  if (!isGoogleConfigured()) {
    return {
      status: "setup",
      message: `Google 로그인 설정을 마치면 ${label} 정보가 여기에 나와요.`,
      action: { href: "/settings#google", label: "설정 방법 보기" },
    };
  }
  const accounts = (await getAccounts()).filter((a) => grantedServices(a.scope).includes(service));
  if (!accounts.length) {
    return {
      status: "setup",
      message: `${label}${josa.eulReul(label)} 볼 Google 계정을 연결하세요.`,
      action: { href: `/api/auth/google/start?mode=link&services=${service}`, label: "계정 연결" },
    };
  }
  const results = await Promise.all(
    accounts.map((a) => settle(cached(`g:${a.email}:${cacheKey}`, ttlMs, () => load(a)))),
  );
  const data: PerAccount<T> = [];
  const warnings: string[] = [];
  results.forEach((r, i) => {
    if (r.ok) data.push({ account: accounts[i].email, value: r.value });
    else warnings.push(describeGoogleError(r.error, label));
  });
  if (!data.length) return { status: "error", message: warnings[0] ?? `${label} 정보를 불러오지 못했어요.` };
  return ok(data, warnings);
}

export const loadCalendar = cache(async (demo: boolean): Promise<Section<CalEvent[]>> => {
  if (demo) return ok(demoEvents(new Date()));
  const today = dateKey();
  const r = await perAccount("calendar", "캘린더", `cal:${today}`, 90_000, (a) => fetchEvents(a, today, 3));
  if (r.status !== "ok") return r;
  return ok(dedupeEvents(r.data.flatMap((d) => d.value)), r.warnings);
});

export interface MailData {
  items: MailItem[];
  unreadByAccount: Record<string, number>;
  totalUnread: number;
}

export const loadMail = cache(async (demo: boolean): Promise<Section<MailData>> => {
  if (demo) {
    const items = demoMail(new Date());
    const unreadByAccount: Record<string, number> = { [DEMO_ACCOUNTS[0].email]: 12, [DEMO_ACCOUNTS[1].email]: 4, [DEMO_ACCOUNTS[2].email]: 2 };
    return ok({ items, unreadByAccount, totalUnread: 18 });
  }
  const r = await perAccount("gmail", "Gmail", "mail", 60_000, fetchMail);
  if (r.status !== "ok") return r;
  const unreadByAccount: Record<string, number> = {};
  for (const d of r.data) unreadByAccount[d.account] = d.value.inboxUnread;
  const items = r.data.flatMap((d) => d.value.items).sort((a, b) => b.date.localeCompare(a.date));
  return ok(
    { items, unreadByAccount, totalUnread: Object.values(unreadByAccount).reduce((s, n) => s + n, 0) },
    r.warnings,
  );
});

export const loadClassroom = cache(async (demo: boolean): Promise<Section<ClassroomData>> => {
  if (demo) return ok(demoClassroom(new Date()));
  const r = await perAccount("classroom", "클래스룸", "classroom", 120_000, (a) => fetchClassroom(a));
  if (r.status !== "ok") return r;
  return ok(
    {
      assignments: r.data
        .flatMap((d) => d.value.assignments)
        .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")),
      announcements: r.data
        .flatMap((d) => d.value.announcements)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      courseCount: r.data.reduce((s, d) => s + d.value.courseCount, 0),
    },
    r.warnings,
  );
});

export const loadNotifications = cache(async (demo: boolean): Promise<Section<NotificationItem[]>> => {
  if (demo) return ok(demoNotifications(new Date()));
  try {
    return ok(await listNotifications());
  } catch (e) {
    console.error("[notifications]", e);
    return { status: "error", message: "저장된 알림을 불러오지 못했어요. 저장소 연결을 확인하세요." };
  }
});

export const loadMemos = cache(async (demo: boolean): Promise<Memo[]> => {
  if (demo) return demoMemos(new Date());
  try {
    return await listMemos();
  } catch (e) {
    console.error("[memos]", e);
    return [];
  }
});

export const loadChecksCached = cache(async (demo: boolean): Promise<Record<string, string>> => {
  if (demo) return {};
  try {
    return await loadChecks();
  } catch {
    return {};
  }
});

export const loadUsage = cache(async (demo: boolean): Promise<UsageView> => {
  const fx = await getUsdKrw();
  let reports = demo ? demoUsageReports(new Date()) : [];
  if (!demo) {
    try {
      reports = await loadUsageReports();
    } catch (e) {
      console.error("[usage]", e);
    }
  }
  return summarizeUsage(reports, fx, new Date());
});

export const loadBriefing = cache(async (demo: boolean): Promise<Briefing> => {
  const [cal, mail, cls, notes, memos, usage, checks] = await Promise.all([
    loadCalendar(demo),
    loadMail(demo),
    loadClassroom(demo),
    loadNotifications(demo),
    loadMemos(demo),
    loadUsage(demo),
    loadChecksCached(demo),
  ]);
  return buildBriefing({
    now: new Date(),
    events: cal.status === "ok" ? cal.data : null,
    assignments: cls.status === "ok" ? cls.data.assignments : null,
    mail: mail.status === "ok" ? mail.data.items : null,
    notifications: notes.status === "ok" ? notes.data : null,
    memos,
    usage,
    checks,
  });
});
