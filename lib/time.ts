// 모든 날짜 계산은 한국 시간(KST, UTC+9, 서머타임 없음) 기준이다.
// 서버(Vercel)는 UTC로 돌기 때문에 Date의 로컬 메서드를 쓰지 않는다.

export const TIME_ZONE = "Asia/Seoul";
const KST_OFFSET = 9 * 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export interface KstParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

export function kstParts(date: Date): KstParts {
  const d = new Date(date.getTime() + KST_OFFSET);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** KST 기준 YYYY-MM-DD */
export function dateKey(date: Date = new Date()): string {
  const p = kstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** YYYY-MM-DD(KST) 자정 */
export function startOfDay(key: string): Date {
  return new Date(`${key}T00:00:00+09:00`);
}

export function shiftDateKey(key: string, days: number): string {
  return dateKey(new Date(startOfDay(key).getTime() + days * DAY));
}

/** 두 시각의 날짜 차이(KST 달력 기준). 내일이면 1. */
export function dayDiff(date: Date, now: Date = new Date()): number {
  return Math.round(
    (startOfDay(dateKey(date)).getTime() - startOfDay(dateKey(now)).getTime()) / DAY,
  );
}

export function minutesOfDay(date: Date): number {
  const p = kstParts(date);
  return p.hour * 60 + p.minute;
}

/** 오전 9:05 */
export function formatTime(date: Date): string {
  const { hour, minute } = kstParts(date);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 ? "오전" : "오후"} ${h12}:${pad(minute)}`;
}

/** 09:05 */
export function formatClock(date: Date): string {
  const { hour, minute } = kstParts(date);
  return `${pad(hour)}:${pad(minute)}`;
}

/** 9월 24일 목요일 */
export function formatLongDate(date: Date): string {
  const p = kstParts(date);
  return `${p.month}월 ${p.day}일 ${WEEKDAYS[p.weekday]}요일`;
}

/** 9월 24일 (목) */
export function formatShortDate(date: Date): string {
  const p = kstParts(date);
  return `${p.month}월 ${p.day}일 (${WEEKDAYS[p.weekday]})`;
}

/** 오늘, 내일, 어제, 모레 또는 9월 26일 (금) */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const diff = dayDiff(date, now);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === 2) return "모레";
  if (diff === -1) return "어제";
  return formatShortDate(date);
}

/** 오늘 오후 11:59, 내일 오전 9:00, 9월 26일 (금) 오후 3:00 */
export function formatWhen(date: Date, now: Date = new Date()): string {
  return `${dayLabel(date, now)} ${formatTime(date)}`;
}

/** 2시간 14분 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / MINUTE));
  const days = Math.floor(total / (60 * 24));
  const hours = Math.floor((total % (60 * 24)) / 60);
  const minutes = total % 60;
  if (days > 0) return hours ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return `${Math.max(1, minutes)}분`;
}

/** 방금, 3분 전, 2시간 후, 3일 전 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return "방금";
  const suffix = diff > 0 ? "후" : "전";
  if (abs < HOUR) return `${Math.round(abs / MINUTE)}분 ${suffix}`;
  if (abs < DAY) return `${Math.floor(abs / HOUR)}시간 ${suffix}`;
  return `${Math.floor(abs / DAY)}일 ${suffix}`;
}

/** 시간대별 하늘. 히어로 배경과 인사말에 쓴다. */
export type SkyPhase = "dawn" | "day" | "dusk" | "night";

export function skyPhase(date: Date = new Date()): SkyPhase {
  const h = kstParts(date).hour;
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

export function greeting(date: Date = new Date()): string {
  const h = kstParts(date).hour;
  if (h >= 4 && h < 11) return "좋은 아침이에요";
  if (h >= 11 && h < 17) return "좋은 오후예요";
  if (h >= 17 && h < 22) return "좋은 저녁이에요";
  return "늦은 밤이에요";
}
