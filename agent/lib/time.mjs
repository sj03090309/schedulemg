const KST_OFFSET = 9 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** KST 기준 YYYY-MM-DD */
export function kstDateKey(ms) {
  return new Date(ms + KST_OFFSET).toISOString().slice(0, 10);
}

/** 그날 KST 자정 (epoch ms) */
export function kstDayStart(ms) {
  return Date.parse(`${kstDateKey(ms)}T00:00:00+09:00`);
}

export function kstStamp(ms = Date.now()) {
  return new Date(ms + KST_OFFSET).toISOString().slice(0, 19).replace("T", " ");
}
