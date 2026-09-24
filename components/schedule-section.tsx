import { ChevronDown, MapPin, Video } from "lucide-react";
import { loadBriefing, loadCalendar } from "@/lib/dashboard-data";
import type { CalEvent } from "@/lib/google/calendar";
import { dateKey, formatClock, formatShortDate, shiftDateKey, startOfDay } from "@/lib/time";
import { Notice, Section, Warnings } from "./ui";

/** 오늘 일정 (Google 캘린더 여러 계정 + 맥 캘린더). 과제 마감은 '할 일'에 있다. */
export async function ScheduleSection({ demo }: { demo: boolean }) {
  const [calendar, b] = await Promise.all([loadCalendar(demo), loadBriefing(demo)]);
  const now = new Date();
  const aside = (
    <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-sky hover:underline">
      캘린더 열기
    </a>
  );

  if (calendar.status !== "ok") {
    return (
      <Section id="schedule" title="오늘 일정" aside={aside}>
        <Notice
          tone={calendar.status === "error" ? "error" : "setup"}
          message={calendar.message}
          action={calendar.status === "setup" ? calendar.action : undefined}
        />
      </Section>
    );
  }

  const allDay = b.today.filter((e) => e.allDay);
  const timed = b.today.filter((e) => !e.allDay);

  return (
    <Section id="schedule" title="오늘 일정" count={b.counts.events || null} aside={aside}>
      <Warnings items={calendar.warnings} />
      <div className="rounded-[20px] bg-surface px-4 sm:px-5">
        {allDay.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 border-b border-line py-3" aria-label="종일 일정">
            {allDay.map((e) => (
              <li
                key={e.id}
                className="rounded-full px-2.5 py-1 text-[13px] font-medium text-ink"
                style={{ background: `color-mix(in oklab, ${e.color} 16%, var(--surface))` }}
              >
                {e.title}
                {e.holiday && <span className="ml-1 font-normal text-ink-3">공휴일</span>}
              </li>
            ))}
          </ul>
        )}
        {timed.length === 0 ? (
          <p className="py-4 text-[15px] text-ink-3">
            {allDay.length ? "시간이 정해진 일정은 없어요." : "오늘은 일정이 없어요."}
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {timed.map((e) => (
              <EventRow key={e.id} e={e} now={now} />
            ))}
          </ol>
        )}
      </div>
      {b.tomorrow.length > 0 && <Tomorrow events={b.tomorrow} now={now} />}
    </Section>
  );
}

function EventRow({ e, now }: { e: CalEvent; now: Date }) {
  const start = new Date(e.start);
  const end = new Date(e.end);
  const past = end <= now;
  const current = start <= now && end > now;
  return (
    <li className={`flex gap-3 py-3 ${past ? "opacity-50" : ""}`}>
      <div className="w-[46px] shrink-0 text-right tabular-nums">
        <span className="block text-[15px] font-semibold leading-snug text-ink">{formatClock(start)}</span>
        <span className="block text-[12px] text-ink-3">{formatClock(end)}</span>
      </div>
      <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug text-ink">
          {e.link ? (
            <a href={e.link} target="_blank" rel="noreferrer" className="hover:underline">
              {e.title}
            </a>
          ) : (
            e.title
          )}
          {current && (
            <span className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 align-middle text-[12px] font-semibold text-warning-ink">
              진행 중
            </span>
          )}
        </p>
        {(e.location || (e.meetLink && !past)) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[13px] text-ink-3">
            {e.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{e.location}</span>
              </span>
            )}
            {e.meetLink && !past && (
              <a href={e.meetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky hover:underline">
                <Video className="size-3.5" aria-hidden />
                화상 회의
              </a>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

function Tomorrow({ events, now }: { events: CalEvent[]; now: Date }) {
  const first = events.find((e) => !e.allDay) ?? events[0];
  const tomorrow = startOfDay(shiftDateKey(dateKey(now), 1));
  return (
    <details className="group mt-2">
      <summary className="flex cursor-pointer items-center gap-1.5 rounded-xl px-1 py-2 text-[14px] text-ink-2 hover:text-ink">
        <span className="font-semibold text-ink">내일</span>
        <span className="min-w-0 truncate">
          {first.allDay ? first.title : `${formatClock(new Date(first.start))} ${first.title}`}
          {events.length > 1 && <span className="text-ink-3"> 외 {events.length - 1}개</span>}
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mt-1 space-y-1.5 px-1 pb-1" aria-label={`내일 일정, ${formatShortDate(tomorrow)}`}>
        {events.map((e) => (
          <li key={e.id} className="flex gap-3 text-[14px] text-ink-2">
            <span className="w-[46px] shrink-0 text-right tabular-nums text-ink-3">{e.allDay ? "종일" : formatClock(new Date(e.start))}</span>
            <span className="min-w-0 break-words">{e.title}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
