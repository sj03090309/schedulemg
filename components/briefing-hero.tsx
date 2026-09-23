import { TriangleAlert } from "lucide-react";
import { loadBriefing } from "@/lib/dashboard-data";
import { skyPhase, type SkyPhase } from "@/lib/time";
import { SpeakButton } from "./client/speak-button";
import { DayRibbon } from "./day-ribbon";

/** sky: 예시 화면에서 다른 시간대의 하늘을 미리 볼 때만 쓴다 */
export async function BriefingHero({ demo, sky }: { demo: boolean; sky?: SkyPhase }) {
  const briefing = await loadBriefing(demo);
  const now = new Date();
  const lines = briefing.lines.slice(0, 5);

  return (
    <section
      aria-labelledby="briefing-title"
      data-sky={sky ?? skyPhase(now)}
      className="hero relative overflow-hidden rounded-[28px] px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap gap-x-3 text-[14px] font-medium text-hero-ink-2">
            <span>{briefing.dateLabel}</span>
            <span>{briefing.greeting}</span>
          </p>
          <h1
            id="briefing-title"
            className="mt-2 max-w-[21em] text-[26px] font-bold leading-[1.3] tracking-[-0.025em] sm:text-[34px] lg:text-[38px]"
          >
            {briefing.headline}
          </h1>
        </div>
        <SpeakButton text={briefing.speech} />
      </div>

      {lines.length > 0 && (
        <ul className="mt-4 max-w-[44em] space-y-1.5 text-[15px] leading-relaxed text-hero-ink-2 sm:text-[17px]">
          {lines.map((line) => {
            const urgent = line.startsWith("기한이 지난");
            return (
              <li key={line} className="flex items-start gap-2">
                {urgent && <TriangleAlert className="mt-[0.3em] size-4 shrink-0 text-critical" aria-label="급함" />}
                <span className={urgent ? "font-semibold text-hero-ink" : undefined}>{line}</span>
              </li>
            );
          })}
        </ul>
      )}

      <DayRibbon events={briefing.todayEvents} deadlines={briefing.dueToday} now={now} />
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <div className="hero rounded-[28px] px-5 pb-6 pt-6 sm:px-8 sm:pt-8" aria-busy="true" aria-label="브리핑 준비 중">
      <div className="h-4 w-40 animate-pulse rounded bg-[var(--hero-track)]" />
      <div className="mt-4 h-9 w-full max-w-xl animate-pulse rounded-lg bg-[var(--hero-track)]" />
      <div className="mt-3 h-5 w-2/3 max-w-md animate-pulse rounded bg-[var(--hero-track)]" />
      <div className="mt-8 h-[54px] animate-pulse rounded-xl bg-[var(--hero-track)]" />
    </div>
  );
}
