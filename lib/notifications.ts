import { shortHash } from "./crypto";
import { getJSON, getKV, hgetallJSON, hsetJSON, hsetManyJSON, setJSON } from "./store/kv";
import { DAY } from "./time";
import { clampText } from "./text";

export type NotificationSource = "mac" | "iphone" | "android" | "web" | "other";

export interface NotificationItem {
  id: string;
  source: NotificationSource;
  app: string;
  appName: string;
  title: string;
  subtitle?: string;
  body: string;
  receivedAt: string;
  importance: "high" | "normal";
  reasons: string[];
  status: "open" | "done" | "dismissed";
  updatedAt?: string;
  url?: string;
}

export interface NotificationRules {
  keywords: string[];
  importantApps: string[];
  mutedApps: string[];
  dropSecurityCodes: boolean;
}

export const DEFAULT_RULES: NotificationRules = {
  keywords: [
    "마감", "기한", "제출", "과제", "숙제", "시험", "수행평가", "발표", "준비물", "휴강", "보강",
    "공지", "약속", "회의", "미팅", "면접", "예약", "결제", "청구", "납부", "입금", "출금", "이체",
    "환불", "배송", "도착", "택배", "수령", "긴급", "중요", "필독", "부재중", "확인 부탁",
    "deadline", "due", "exam", "assignment", "homework", "meeting", "interview", "appointment",
    "reservation", "invoice", "payment", "urgent", "important", "action required", "reminder",
  ],
  importantApps: ["com.apple.ical", "com.apple.reminders", "com.apple.mobilephone", "classroom", "캘린더", "미리 알림", "클래스룸"],
  mutedApps: [
    "_system_center_", "com.apple.controlcenter", "com.apple.screentime", "com.apple.appstore",
    "com.apple.music", "com.spotify.client", "com.apple.gamecenter", "com.apple.photos",
    "com.apple.replaykit", "com.apple.siri", "com.apple.btusernotifications",
    "com.apple.identityservicesd", "com.apple.managedclient", "com.apple.mdmclient",
  ],
  dropSecurityCodes: true,
};

const APP_NAMES: Record<string, string> = {
  "com.apple.mobilesms": "메시지",
  "com.apple.ichat": "메시지",
  "com.apple.ical": "캘린더",
  "com.apple.reminders": "미리 알림",
  "com.apple.mail": "Mail",
  "com.apple.facetime": "FaceTime",
  "com.apple.mobilephone": "전화",
  "com.apple.findmy": "나의 찾기",
  "com.apple.home": "홈",
  "com.apple.clock": "시계",
  "com.apple.shortcuts": "단축어",
  "com.apple.passbook": "지갑",
  "com.apple.notes": "메모",
  "com.apple.weather": "날씨",
  "com.kakao.kakaotalkmac": "카카오톡",
  "com.kakao.talk": "카카오톡",
  "com.iwilab.kakaotalk": "카카오톡",
  "com.tinyspeck.slackmacgap": "Slack",
  "com.hnc.discord": "Discord",
  "com.google.chrome": "Chrome",
  "com.microsoft.teams2": "Teams",
  "us.zoom.xos": "Zoom",
  "notion.id": "Notion",
  "com.google.classroom": "클래스룸",
  "com.google.android.apps.classroom": "클래스룸",
  "com.google.android.gm": "Gmail",
  "com.google.android.calendar": "캘린더",
  "com.samsung.android.messaging": "메시지",
  "com.samsung.android.calendar": "캘린더",
  "com.anthropic.claudefordesktop": "Claude",
  "com.openai.chat": "ChatGPT",
  "com.openai.codex": "Codex",
};

export function appDisplayName(app: string): string {
  const known = APP_NAMES[app.toLowerCase()];
  if (known) return known;
  if (!app.includes(".") || app.includes(" ")) return app || "알 수 없는 앱";
  const last = app.split(".").pop() ?? app;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// 인증번호는 저장하지 않는다. 오래 남겨 둘 이유가 없고 유출되면 위험하다.
const SECURITY_CODE =
  /(인증\s*번호|인증\s*코드|확인\s*코드|보안\s*코드|승인\s*번호|verification code|security code|one[-\s]?time|\bOTP\b|login code|passcode)/i;
const AD = /^\s*[([]\s*광고\s*[)\]]/;

export interface Classification {
  drop: string | null;
  importance: "high" | "normal";
  reasons: string[];
}

export function classify(
  n: { app: string; appName: string; title: string; subtitle?: string; body: string; important?: boolean },
  rules: NotificationRules,
): Classification {
  const text = `${n.title}\n${n.subtitle ?? ""}\n${n.body}`;
  const app = `${n.app} ${n.appName}`.toLowerCase();
  if (rules.dropSecurityCodes && SECURITY_CODE.test(text) && /\d{4,8}/.test(text)) {
    return { drop: "인증번호", importance: "normal", reasons: [] };
  }
  if (AD.test(n.title) || AD.test(n.body)) return { drop: "광고", importance: "normal", reasons: [] };
  if (n.important) return { drop: null, importance: "high", reasons: ["직접 보낸 알림"] };
  if (rules.mutedApps.some((m) => m && app.includes(m.toLowerCase()))) {
    return { drop: "무시하는 앱", importance: "normal", reasons: [] };
  }
  const reasons: string[] = [];
  if (rules.importantApps.some((a) => a && app.includes(a.toLowerCase()))) reasons.push("중요한 앱");
  const lower = text.toLowerCase();
  for (const k of rules.keywords) {
    if (k && lower.includes(k.toLowerCase())) reasons.push(`‘${k}’`);
    if (reasons.length >= 3) break;
  }
  return { drop: null, importance: reasons.length ? "high" : "normal", reasons };
}

const KEY = "notifications";
const RULES_KEY = "notifications:rules";

export async function getRules(): Promise<NotificationRules> {
  const saved = await getJSON<Partial<NotificationRules>>(RULES_KEY);
  return { ...DEFAULT_RULES, ...(saved ?? {}) };
}

export async function saveRules(rules: NotificationRules): Promise<void> {
  await setJSON(RULES_KEY, rules);
}

export interface IncomingNotification {
  source?: string;
  app?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  time?: unknown;
  important?: boolean;
  url?: string;
  externalId?: string;
}

/** 휴대폰 자동화 앱마다 필드 이름이 달라서 흔한 이름을 모두 받아 준다. */
export function normalizeIncoming(raw: unknown): IncomingNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return undefined;
  };
  const important = r.important;
  return {
    source: pick("source", "device", "platform"),
    app: pick("app", "appName", "app_name", "package", "packageName", "bundleId", "application"),
    title: pick("title", "sender", "from", "subject"),
    subtitle: pick("subtitle"),
    body: pick("body", "text", "message", "content", "notification"),
    time: r.time ?? r.timestamp ?? r.postedAt ?? r.date,
    important: important === true || important === "true" || important === 1 || important === "1",
    url: pick("url", "link"),
    externalId: pick("externalId", "id"),
  };
}

function parseTime(value: unknown, now: number): number {
  let t = NaN;
  if (typeof value === "number") t = value < 1e12 ? value * 1000 : value;
  else if (typeof value === "string" && value.trim()) {
    t = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : Date.parse(value);
    if (Number.isFinite(t) && t < 1e12) t *= 1000;
  }
  if (!Number.isFinite(t) || t > now + 5 * 60_000 || t < now - 30 * DAY) return now;
  return t;
}

function sourceOf(value: string | undefined): NotificationSource {
  const v = (value ?? "").toLowerCase();
  if (/mac|desktop|laptop/.test(v)) return "mac";
  if (/iphone|ios|ipad/.test(v)) return "iphone";
  if (/android|galaxy|samsung|pixel/.test(v)) return "android";
  if (/web|browser/.test(v)) return "web";
  return "other";
}

export interface IngestResult {
  received: number;
  stored: number;
  important: number;
  dropped: number;
  duplicates: number;
}

export async function ingestNotifications(list: IncomingNotification[]): Promise<IngestResult> {
  const now = Date.now();
  const rules = await getRules();
  const existing = await hgetallJSON<NotificationItem>(KEY);
  const toStore: Record<string, NotificationItem> = {};
  const result: IngestResult = { received: list.length, stored: 0, important: 0, dropped: 0, duplicates: 0 };

  for (const n of list) {
    const title = clampText(n.title ?? "", 200);
    const body = clampText(n.body ?? "", 1000);
    if (!title && !body) {
      result.dropped++;
      continue;
    }
    const app = clampText(n.app ?? "", 120) || "알 수 없는 앱";
    const appName = appDisplayName(app);
    const subtitle = n.subtitle ? clampText(n.subtitle, 200) : undefined;
    const c = classify({ app, appName, title, subtitle, body, important: n.important }, rules);
    if (c.drop) {
      result.dropped++;
      continue;
    }
    const source = sourceOf(n.source);
    const time = parseTime(n.time, now);
    const id = shortHash(
      n.externalId ? `ext:${n.externalId}` : `${source}|${app}|${title}|${body}|${Math.floor(time / 60_000)}`,
    );
    if (existing[id] || toStore[id]) {
      result.duplicates++;
      continue;
    }
    toStore[id] = {
      id,
      source,
      app,
      appName,
      title,
      subtitle,
      body,
      receivedAt: new Date(time).toISOString(),
      importance: c.importance,
      reasons: c.reasons,
      status: "open",
      url: n.url && /^https?:\/\//.test(n.url) ? n.url : undefined,
    };
    result.stored++;
    if (c.importance === "high") result.important++;
  }

  await hsetManyJSON(KEY, toStore);
  await prune({ ...existing, ...toStore }, now);
  return result;
}

async function prune(all: Record<string, NotificationItem>, now: number): Promise<void> {
  const remove = new Set<string>();
  for (const n of Object.values(all)) {
    const age = now - Date.parse(n.receivedAt);
    if (n.importance === "normal" && age > 3 * DAY) remove.add(n.id);
    else if (n.status !== "open" && age > 14 * DAY) remove.add(n.id);
    else if (age > 45 * DAY) remove.add(n.id);
  }
  const rest = Object.values(all)
    .filter((n) => !remove.has(n.id))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  for (const n of rest.slice(600)) remove.add(n.id);
  if (remove.size) await getKV().hdel(KEY, ...remove);
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const all = await hgetallJSON<NotificationItem>(KEY);
  return Object.values(all).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function updateNotification(
  id: string,
  patch: Partial<Pick<NotificationItem, "status" | "importance">>,
): Promise<void> {
  const current = (await hgetallJSON<NotificationItem>(KEY))[id];
  if (!current) return;
  await hsetJSON(KEY, id, { ...current, ...patch, updatedAt: new Date().toISOString() });
}
