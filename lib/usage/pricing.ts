import type { Provider, RecentRow } from "./types";

/** 100만 토큰당 USD */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
}

// Anthropic API 정가 (2026년 9월 기준). 캐시 쓰기는 5분=입력×1.25, 1시간=입력×2.
function claude(input: number, output: number, cacheRead: number): Price {
  return { input, output, cacheRead, cacheWrite: input * 1.25, cacheWrite1h: input * 2 };
}

const CLAUDE_PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, claude(10, 50, 0.25)],
  [/(fable|mythos)/, claude(10, 50, 1)],
  [/opus-5-5/, claude(4, 20, 0.2)],
  [/opus-5/, claude(5, 25, 0.5)],
  [/opus-4-[5-9]/, claude(5, 25, 0.5)],
  [/opus/, claude(15, 75, 1.5)],
  [/sonnet-5/, claude(2, 10, 0.2)],
  [/sonnet/, claude(3, 15, 0.3)],
  [/haiku-4/, claude(1, 5, 0.1)],
  [/haiku/, claude(0.8, 4, 0.08)],
];
const CLAUDE_DEFAULT = claude(5, 25, 0.5);

// OpenAI API 정가 (Standard, 2026년 9월 기준). 캐시 쓰기 요금이 없는 모델은 입력 요금을 쓴다.
function openai(input: number, output: number, cacheRead: number, cacheWrite = input): Price {
  return { input, output, cacheRead, cacheWrite };
}

// GPT-5.6 Sol은 2026-11-21까지 프로모션 가격, 이후 정가($5 / $30)로 계산한다.
const SOL_PROMO_END = "2026-11-21";

const OPENAI_PRICES: [RegExp, Price | ((date: string) => Price)][] = [
  // gpt-5.6-sol 같은 이름에 걸리지 않도록 'gpt-6'으로 시작하는지 본다.
  [/gpt-6[\d.]*-astra/, openai(10, 50, 1, 12.5)],
  [/gpt-6[\d.]*-sol/, openai(2, 10, 0.2, 2.5)],
  [/gpt-6[\d.]*-luna/, openai(0.1, 0.5, 0.01, 0.125)],
  [/-astra\b|-astra$/, openai(10, 50, 1, 12.5)],
  [/-sol\b|-sol$/, (date) => (date <= SOL_PROMO_END ? openai(4, 20, 0.4, 5) : openai(5, 30, 0.5, 6.25))],
  [/-terra\b|-terra$/, openai(2, 12, 0.2, 2.5)],
  [/-luna\b|-luna$/, openai(0.2, 1.2, 0.02, 0.25)],
  [/5\.[45]-pro/, openai(30, 180, 30)],
  [/5\.5/, openai(5, 30, 0.5)],
  [/5\.4-mini/, openai(0.75, 4.5, 0.075)],
  [/5\.4-nano/, openai(0.2, 1.25, 0.02)],
  [/5\.4/, openai(2.5, 15, 0.25)],
  [/5\.[23]/, openai(1.75, 14, 0.175)],
  [/codex-mini|5(\.1)?-mini|-mini\b/, openai(0.25, 2, 0.025)],
  [/-nano\b/, openai(0.05, 0.4, 0.005)],
];
const OPENAI_DEFAULT = openai(1.25, 10, 0.125);

export function priceFor(provider: Provider, model: string, date: string): Price {
  const m = model.toLowerCase();
  const table = provider === "claude" ? CLAUDE_PRICES : OPENAI_PRICES;
  for (const [pattern, price] of table) {
    if (pattern.test(m)) return typeof price === "function" ? price(date) : price;
  }
  return provider === "claude" ? CLAUDE_DEFAULT : OPENAI_DEFAULT;
}

const MILLION = 1_000_000;
const WEB_SEARCH_USD = 10 / 1000;

/** API 정가로 환산한 비용 (USD). 구독 요금제 사용분도 "API였다면 얼마"로 계산한다. */
export function costUSD(provider: Provider, row: RecentRow & { date?: string }, fallbackDate: string): number {
  const fast = row.model.endsWith(":fast");
  const model = row.model.replace(/:fast$/, "");
  const price = priceFor(provider, model, row.date ?? fallbackDate);
  const tokens =
    row.input * price.input +
    row.output * price.output +
    row.cacheRead * price.cacheRead +
    row.cacheWrite * price.cacheWrite +
    (row.cacheWrite1h ?? 0) * (price.cacheWrite1h ?? price.cacheWrite);
  // Claude 빠른 모드(Opus 5 / 5.5)는 표준 요금의 2배
  return (tokens / MILLION) * (fast ? 2 : 1) + (row.webSearches ?? 0) * WEB_SEARCH_USD;
}

export function totalTokens(row: RecentRow): number {
  return row.input + row.output + row.cacheRead + row.cacheWrite + (row.cacheWrite1h ?? 0);
}

const PLAN_NAMES: Record<string, string> = {
  free: "무료",
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro Lite",
  max: "Max",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  edu: "Edu",
};

/** 요금제 코드(prolite, max …)를 사람이 읽는 이름으로 */
export function planLabel(plan: string): string {
  return PLAN_NAMES[plan.toLowerCase()] ?? plan;
}

/** claude-opus-4-8 → Opus 4.8, gpt-5.6-sol → GPT-5.6 Sol */
export function modelLabel(model: string): string {
  const fast = model.endsWith(":fast");
  let m = model.replace(/:fast$/, "");
  const c = m.match(/^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  if (c) {
    const [, family, major, minor] = c;
    m = `${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ""}`;
  } else if (/^gpt-/i.test(m)) {
    m = m
      .replace(/^gpt-/i, "GPT-")
      .replace(/-([a-z]+)/g, (_, w: string) => ` ${w[0].toUpperCase()}${w.slice(1)}`);
  }
  return fast ? `${m} 빠른 모드` : m;
}
