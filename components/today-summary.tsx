import type { ReactNode } from "react";
import { loadBriefing } from "@/lib/dashboard-data";
import { josa } from "@/lib/text";
import { formatClock, formatLongDate } from "@/lib/time";

/** 맨 위 한 줄: 날짜, 지금·다음 일정, 급한 할 일 개수 */
export async function TodaySummary({ demo }: { demo: boolean }) {
  const b = await loadBriefing(demo);
  const now = new Date();
  const holidays = [...new Set(b.today.filter((e) => e.holiday).map((e) => e.title))];

  const parts: ReactNode[] = [];
  if (holidays.length) {
    const name = holidays.join(", ");
    parts.push(`오늘은 ${name}${josa.ieyo(name)}`);
  }
  if (b.current) {
    parts.push(
      <>
        지금 <strong className="font-semibold text-ink">{b.current.title}</strong> ({formatClock(new Date(b.current.end))}까지)
      </>,
    );
  } else if (b.next) {
    parts.push(
      <>
        다음 일정 <strong className="font-semibold text-ink">{formatClock(new Date(b.next.start))} {b.next.title}</strong>
      </>,
    );
  } else if (b.eventsKnown) {
    parts.push(b.counts.events ? "오늘 일정은 모두 끝났어요" : "오늘은 일정이 없어요");
  }
  if (b.counts.overdue) {
    parts.push(<strong className="whitespace-nowrap font-semibold text-critical">마감 지난 일 {b.counts.overdue}개</strong>);
  }
  if (b.counts.dueToday) {
    parts.push(<strong className="whitespace-nowrap font-semibold text-ink">오늘 마감 {b.counts.dueToday}개</strong>);
  }

  return (
    <section aria-labelledby="today-title" className="px-1">
      <h1 id="today-title" className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[34px]">
        {formatLongDate(now)}
      </h1>
      {parts.length > 0 && (
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
          {parts.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="px-1.5 text-ink-3">·</span>}
              {p}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

export function TodaySummarySkeleton() {
  return (
    <div className="px-1" aria-busy="true" aria-label="오늘 요약 준비 중">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-3 h-5 w-full max-w-md animate-pulse rounded bg-surface-2" />
    </div>
  );
}
