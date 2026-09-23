import { TriangleAlert } from "lucide-react";
import { loadUsage } from "@/lib/dashboard-data";
import { formatCount, formatKRW } from "@/lib/text";
import { formatRelative } from "@/lib/time";
import { modelLabel, planLabel } from "@/lib/usage/pricing";
import type { DailyPoint, ProviderView, Totals, WindowView } from "@/lib/usage/summary";
import { Notice, Section } from "./ui";

export async function UsageSection({ demo }: { demo: boolean }) {
  const usage = await loadUsage(demo);
  const now = new Date();
  const fx = usage.fx;

  return (
    <Section
      id="ai"
      title="AI 사용량"
      aside={
        usage.lastReportAt ? (
          <span className="text-[13px] text-ink-3">{formatRelative(new Date(usage.lastReportAt), now)} 수집</span>
        ) : null
      }
    >
      {!usage.hasAgent ? (
        <Notice
          message="맥에서 수집 에이전트를 실행하면 Claude Code와 Codex의 남은 한도, 사용한 토큰, 원화 환산 금액이 여기에 나와요."
          action={{ href: "/settings#agent", label: "에이전트 연결 방법" }}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          <ProviderPanel p={usage.claude} now={now} />
          <ProviderPanel p={usage.codex} now={now} />
        </div>
      )}
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-ink-3">
        금액은 API 정가로 환산한 추정치예요. 1달러를 {Math.round(fx.rate).toLocaleString("ko-KR")}원으로 계산했어요
        {fx.fallback ? " (환율을 불러오지 못해 기본값을 썼어요)." : ` (${fx.date ?? "오늘"}, ${fx.source}).`}
      </p>
    </Section>
  );
}

function ProviderPanel({ p, now }: { p: ProviderView; now: Date }) {
  return (
    <article aria-labelledby={`${p.provider}-name`} className="rounded-[18px] bg-surface p-4 sm:p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 id={`${p.provider}-name`} className="text-[16px] font-semibold text-ink">
          {p.name}
        </h3>
        <span className="truncate text-[12px] text-ink-3">
          {[p.latestModel ? modelLabel(p.latestModel) : null, p.limits?.plan ? `${planLabel(p.limits.plan)} 요금제` : null]
            .filter(Boolean)
            .join(", ")}
        </span>
      </header>

      {p.status === "missing" && (
        <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
          에이전트가 이 맥에서 {p.name} 사용 기록을 찾지 못했어요.
        </p>
      )}
      {p.status === "error" && <p className="mt-3 text-[14px] leading-relaxed text-ink-3">{p.message}</p>}

      {p.status === "ok" && (
        <>
          <div className="mt-4 space-y-4">
            {p.limits ? (
              p.limits.windows.map((w) => <Meter key={w.id} w={w} />)
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-3">
                {p.limitsError ?? "남은 한도 정보를 아직 받지 못했어요. 사용 기록이 쌓이면 표시돼요."}
              </p>
            )}
          </div>

          <table className="mt-5 w-full text-[14px]">
            <caption className="sr-only">{p.name} 사용량과 원화 환산 금액</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">기간</th>
                <th scope="col">금액</th>
                <th scope="col">토큰</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ["오늘", p.today],
                  ["최근 7일", p.week],
                  ["이번 달", p.month],
                ] as [string, Totals][]
              ).map(([label, t]) => (
                <tr key={label} className="border-t border-line">
                  <th scope="row" className="py-2 text-left font-normal text-ink-2">
                    {label}
                  </th>
                  <td className="py-2 text-right font-semibold text-ink">{formatKRW(t.costKRW)}</td>
                  <td className="w-[42%] py-2 pl-3 text-right text-[13px] text-ink-3">{formatCount(t.tokens)} 토큰</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.last5h && p.last5h.tokens > 0 && (
            <p className="mt-1 text-[12px] text-ink-3">
              최근 5시간 동안 {formatCount(p.last5h.tokens)} 토큰, {formatKRW(p.last5h.costKRW)}
            </p>
          )}

          <DailyBars points={p.daily} name={p.name} />

          {p.models.length > 1 && (
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              이번 달 비용 비중: {p.models.map((m) => `${m.label} ${Math.round(m.share * 100)}%`).join(", ")}
            </p>
          )}
          {p.stale && p.collectedAt && (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-warning-ink">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {formatRelative(new Date(p.collectedAt), now)} 데이터예요. 맥이 잠자기 중이거나 에이전트가 멈췄을 수 있어요.
            </p>
          )}
        </>
      )}
    </article>
  );
}

const LEVEL = {
  ok: { fill: "var(--sky)", track: "var(--sky-soft)" },
  warning: { fill: "var(--warning)", track: "var(--warning-soft)" },
  critical: { fill: "var(--critical)", track: "var(--critical-soft)" },
} as const;

function Meter({ w }: { w: WindowView }) {
  const color = LEVEL[w.level];
  const used = Math.round(w.usedPercent);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] text-ink-2">{w.label} 한도</p>
        <p className="text-[15px] font-semibold text-ink">
          {Math.round(w.remainingPercent)}% <span className="font-medium text-ink-2">남음</span>
        </p>
      </div>
      <div
        role="meter"
        aria-label={`${w.label} 한도 사용률`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={used}
        aria-valuetext={`${used}% 사용, ${100 - used}% 남음`}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full"
        style={{ background: color.track }}
      >
        <div className="h-full rounded-full" style={{ width: `${Math.max(w.usedPercent, 1.5)}%`, background: color.fill }} />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-3">
        {w.level !== "ok" && (
          <span className={`inline-flex items-center gap-1 font-semibold ${w.level === "critical" ? "text-critical" : "text-warning-ink"}`}>
            <TriangleAlert className="size-3.5" aria-hidden />
            {w.level === "critical" ? "거의 다 썼어요" : "많이 썼어요"}
          </span>
        )}
        <span>{used}% 사용</span>
        {w.hasReset ? (
          <span>한도가 초기화됐어요. 새 기록을 기다리는 중이에요.</span>
        ) : (
          w.resetIn && (
            <span>
              {w.resetIn} 뒤 초기화 ({w.resetAt})
            </span>
          )
        )}
      </p>
    </div>
  );
}

function DailyBars({ points, name }: { points: DailyPoint[]; name: string }) {
  const max = Math.max(...points.map((p) => p.costKRW), 1);
  return (
    <figure className="mt-5">
      <figcaption className="mb-1 text-[12px] text-ink-3">최근 7일 비용</figcaption>
      <div className="flex h-[88px] items-end gap-[2px] pt-5" aria-hidden>
        {points.map((p) => {
          const h = p.costKRW > 0 ? Math.max((p.costKRW / max) * 100, 4) : 0;
          return (
            <div
              key={p.date}
              title={`${p.label}: ${formatKRW(p.costKRW)}, ${formatCount(p.tokens)} 토큰`}
              className="relative flex h-full flex-1 items-end justify-center"
            >
              {p.isToday && p.costKRW > 0 && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-ink tabular-nums"
                  style={{ bottom: `calc(${h}% + 3px)` }}
                >
                  {formatKRW(p.costKRW)}
                </span>
              )}
              <div
                className="w-full max-w-[24px] rounded-t-[4px]"
                style={{
                  height: `${h}%`,
                  background: p.isToday ? "var(--sky)" : "color-mix(in oklab, var(--sky) 34%, var(--surface))",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] text-center text-[11px] text-ink-3" aria-hidden>
        {points.map((p) => (
          <span key={p.date} className={`flex-1 ${p.isToday ? "font-semibold text-ink-2" : ""}`}>
            {p.isToday ? "오늘" : p.label.split(" ")[1]}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{name} 최근 7일 원화 환산 비용</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{p.label}</th>
              <td>{formatKRW(p.costKRW)}</td>
              <td>{formatCount(p.tokens)} 토큰</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
