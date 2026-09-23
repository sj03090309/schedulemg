import { cached } from "../concurrency";
import { env } from "../env";
import { dateKey } from "../time";

export interface FxRate {
  /** 1달러 = rate원 */
  rate: number;
  source: string;
  date: string | null;
  fallback: boolean;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchLiveRate(): Promise<FxRate> {
  try {
    const j = await getJSON<{ date?: string; rates?: { KRW?: number } }>(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW",
    );
    if (j.rates?.KRW) return { rate: j.rates.KRW, source: "유럽중앙은행 기준 환율", date: j.date ?? null, fallback: false };
  } catch {
    // 다음 제공처로 넘어간다.
  }
  const j = await getJSON<{ time_last_update_utc?: string; rates?: { KRW?: number } }>(
    "https://open.er-api.com/v6/latest/USD",
  );
  if (!j.rates?.KRW) throw new Error("환율 정보 없음");
  return {
    rate: j.rates.KRW,
    source: "ExchangeRate-API",
    date: j.time_last_update_utc ? dateKey(new Date(j.time_last_update_utc)) : null,
    fallback: false,
  };
}

/** 원/달러 환율. 6시간 동안 캐시하고, 실패하면 USD_KRW_FALLBACK 값을 쓴다. */
export async function getUsdKrw(): Promise<FxRate> {
  try {
    return await cached("fx:usdkrw", 6 * 60 * 60 * 1000, fetchLiveRate);
  } catch {
    return { rate: env.usdKrwFallback, source: "기본값", date: null, fallback: true };
  }
}
