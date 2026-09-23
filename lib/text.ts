// 한국어 조사 처리와 숫자/금액 표기.

const TRAILING = /[\s'"’”)\]』」>]+$/u;

/** 마지막 글자에 받침이 있는지. 숫자와 영문은 읽는 소리로 대략 판단한다. */
export function hasBatchim(word: string): boolean {
  const s = word.trim().replace(TRAILING, "");
  const ch = s.charAt(s.length - 1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return "013678".includes(ch);
  if (/[a-z]/i.test(ch)) return "lmnr".includes(ch.toLowerCase());
  return false;
}

export const josa = {
  iGa: (w: string) => (hasBatchim(w) ? "이" : "가"),
  eunNeun: (w: string) => (hasBatchim(w) ? "은" : "는"),
  eulReul: (w: string) => (hasBatchim(w) ? "을" : "를"),
  gwaWa: (w: string) => (hasBatchim(w) ? "과" : "와"),
  /** ~이에요 / ~예요 */
  ieyo: (w: string) => (hasBatchim(w) ? "이에요" : "예요"),
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const trim0 = (s: string) => s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

/** 9,876 / 12.3만 / 4,567만 / 1.23억 */
export function formatCount(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 10_000) return v.toLocaleString("ko-KR");
  if (v < 100_000_000) {
    const man = v / 10_000;
    return `${man < 100 ? trim0(man.toFixed(1)) : Math.round(man).toLocaleString("ko-KR")}만`;
  }
  const eok = v / 100_000_000;
  return `${trim0(eok.toFixed(eok < 10 ? 2 : 1))}억`;
}

/** 8,420원 / 12.3만 원 / 1.2억 원 */
export function formatKRW(n: number): string {
  const v = Math.max(0, n);
  if (v > 0 && v < 1) return "1원 미만";
  if (v < 100_000) return `${Math.round(v).toLocaleString("ko-KR")}원`;
  if (v < 100_000_000) return `${trim0((v / 10_000).toFixed(1))}만 원`;
  return `${trim0((v / 100_000_000).toFixed(2))}억 원`;
}

export function formatUSD(n: number): string {
  if (n > 0 && n < 0.01) return "$0.01 미만";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function clampText(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
