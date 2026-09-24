import { MapPin, Video } from "lucide-react";
import { eventsOnDay } from "@/lib/briefing";
import { getAccountTags, loadCalendar } from "@/lib/dashboard-data";
import type { AccountTag } from "@/lib/google/accounts";
import type { CalEvent } from "@/lib/google/calendar";
import { dateKey, formatClock, formatShortDate, shiftDateKey, startOfDay } from "@/lib/time";
import { AccountBadge, Empty, Notice, Section, Warnings } from "./ui";

export async function CalendarSection({ demo }: { demo: boolean }) {
  const [calendar, tags] = await Promise.all([loadCalendar(demo), getAccountTags(demo)]);
  const now = new Date();
  const today = dateKey(now);
  const tomorrow = shiftDateKey(today, 1);
  const aside = (
    <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-sky hover:underline">
      캘린더 열기
    </a>
  );

  if (calendar.status !== "ok") {
    return (
      <Section id="calendar" title="오늘 일정" aside={aside}>
        <Notice tone={calendar.status === "error" ? "error" : "setup"} message={calendar.message} action={calendar.status === "setup" ? calendar.action : undefined} />
      </Section>
    );
  }

  const multi = Object.keys(tags).length > 1;
  const todays = eventsOnDay(calendar.data, today);
  const tomorrows = eventsOnDay(calendar.data, tomorrow);

  return (
    <Section id="calendar" title="오늘 일정" count={todays.length} aside={aside}>
      <Warnings items={calendar.warnings} />
      {todays.length === 0 ? (
        <Empty>오늘은 일정이 없어요.</Empty>
      ) : (
        <ol className="divide-y divide-line">
          {todays.map((e) => (
            <EventRow key={e.id} event={e} now={now} tag={multi ? tags[e.account] : undefined} />
          ))}
        </ol>
      )}

      {tomorrows.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 px-1 text-[14px] font-semibold text-ink-2">
            내일 <span className="ml-1 font-normal text-ink-3">{formatShortDate(startOfDay(tomorrow))}</span>
          </h3>
          <ol className="divide-y divide-line">
            {tomorrows.map((e) => (
              <EventRow key={e.id} event={e} now={now} tag={multi ? tags[e.account] : undefined} compact />
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}

function EventRow({ event: e, now, tag, compact }: { event: CalEvent; now: Date; tag?: AccountTag; compact?: boolean }) {
  const start = new Date(e.start);
  const end = new Date(e.end);
  const past = !e.allDay && end <= now;
  const current = !e.allDay && start <= now && end > now;

  return (
    <li className={`flex gap-3 py-3 ${past ? "opacity-55" : ""}`}>
      <div className="w-[50px] shrink-0 pt-px text-right tabular-nums">
        {e.allDay ? (
          <span className="text-[13px] font-medium text-ink-2">종일</span>
        ) : (
          <>
            <span className="block text-[15px] font-semibold leading-tight text-ink">{formatClock(start)}</span>
            {!compact && <span className="block text-[12px] text-ink-3">{formatClock(end)}</span>}
          </>
        )}
      </div>
      <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: e.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug text-ink">
          {e.link ? (
            <a href={e.link} target="_blank" rel="noreferrer" className="hover:underline">
              {e.title}
            </a>
          ) : (
            e.title
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
          {current && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <span aria-hidden className="size-2 rounded-full bg-sun" />
              진행 중
            </span>
          )}
          {e.classroom && <span className="font-semibold text-critical">과제 마감</span>}
          {e.holiday && <span className="font-medium text-ink-2">공휴일</span>}
          {e.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {e.location}
            </span>
          )}
          {e.meetLink && !past && (
            <a href={e.meetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky hover:underline">
              <Video className="size-3.5" aria-hidden />
              화상 회의 참여
            </a>
          )}
          {!compact && <span>{e.calendar}</span>}
          <AccountBadge tag={tag} />
        </p>
      </div>
    </li>
  );
}
