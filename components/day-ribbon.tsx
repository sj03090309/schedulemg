import { readableOn } from "@/lib/color";
import type { CalEvent } from "@/lib/google/calendar";
import type { Assignment } from "@/lib/google/classroom";
import { dateKey, formatClock, startOfDay } from "@/lib/time";

const LANE_HEIGHT = 30;
const LANE_GAP = 4;
const MAX_LANES = 3;

/**
 * 오늘 하루를 가로 띠 하나로 보여 준다: 일정 블록, 과제 마감 표시, 지금 시각.
 * 자세한 내용은 아래 "오늘 일정" 목록이 맡고, 여기는 하루의 모양만 보여 준다.
 */
export function DayRibbon({ events, deadlines, now }: { events: CalEvent[]; deadlines: Assignment[]; now: Date }) {
  const dayStart = startOfDay(dateKey(now)).getTime();
  const minuteOf = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60_000);
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);

  // 기본은 오전 7시부터 자정까지, 더 이른 일정이 있으면 그 시각부터
  const earliest = Math.min(7 * 60, ...timed.map((e) => Math.max(0, minuteOf(e.start))));
  const startMin = Math.floor(earliest / 60) * 60;
  const endMin = 24 * 60;
  const pct = (m: number) => ((Math.min(Math.max(m, startMin), endMin) - startMin) / (endMin - startMin)) * 100;

  const laneEnds: number[] = [];
  const blocks = [...timed]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const s = Math.max(minuteOf(e.start), startMin);
      const en = Math.min(Math.max(minuteOf(e.end), s + 15), endMin);
      let lane = laneEnds.findIndex((end) => end <= s);
      if (lane === -1) lane = laneEnds.length < MAX_LANES ? laneEnds.length : laneEnds.indexOf(Math.min(...laneEnds));
      laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, en);
      return { e, s, en, lane };
    })
    .filter((b) => b.en > startMin && b.s < endMin);

  const lanes = Math.max(1, laneEnds.length);
  const trackHeight = lanes * LANE_HEIGHT + (lanes - 1) * LANE_GAP + 12;
  const nowMin = minuteOf(now.toISOString());
  const nowPct = pct(nowMin);
  const ticks: number[] = [];
  for (let h = Math.ceil(startMin / 60); h <= 24; h++) if (h % 3 === 0) ticks.push(h);
  const pins = deadlines
    .filter((a) => a.due)
    .map((a) => ({ a, m: minuteOf(a.due!) }))
    .filter((p) => p.m >= startMin && p.m <= endMin);

  const summary = timed.length
    ? `오늘 일정 ${timed.length}개: ${timed.map((e) => `${formatClock(new Date(e.start))} ${e.title}`).join(", ")}`
    : "오늘은 시간이 정해진 일정이 없어요";

  return (
    <div className="mt-6">
      {allDay.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {allDay.map((e) => (
            <li
              key={e.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--hero-track)] px-3 py-1 text-[13px] text-hero-ink"
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: e.color }} />
              <span className="text-hero-ink-2">종일</span> {e.title}
            </li>
          ))}
        </ul>
      )}

      <div role="img" aria-label={summary}>
        <div className="relative h-5 text-[11px] text-hero-ink-2 tabular-nums" aria-hidden>
          {ticks.map((h) => {
            const p = pct(h * 60);
            const shift = p <= 1 ? "" : p >= 99 ? "-translate-x-full" : "-translate-x-1/2";
            return (
              <span
                key={h}
                className={`absolute top-0 whitespace-nowrap ${shift} ${h % 6 !== 0 ? "max-sm:hidden" : ""}`}
                style={{ left: `${p}%` }}
              >
                {h}시
              </span>
            );
          })}
        </div>

        <div
          className="relative rounded-xl bg-[var(--hero-track)]"
          style={{ height: trackHeight }}
          aria-hidden
        >
          {ticks.map((h) => (
            <span key={h} className="absolute inset-y-0 w-px bg-hero-line" style={{ left: `${pct(h * 60)}%` }} />
          ))}
          {nowMin > startMin && (
            <span
              className="absolute inset-y-0 left-0 rounded-l-xl bg-hero-line"
              style={{ width: `${nowPct}%`, opacity: 0.45 }}
            />
          )}
          {blocks.map((b, i) => {
            const left = pct(b.s);
            const width = pct(b.en) - left;
            const start = new Date(b.e.start);
            const end = new Date(b.e.end);
            return (
              <div
                key={b.e.id}
                title={`${formatClock(start)}–${formatClock(end)} ${b.e.title}`}
                className="ribbon-block absolute overflow-hidden rounded-[6px] px-2 text-[12px] font-medium"
                style={{
                  left: `calc(${left}% + 1px)`,
                  width: `calc(${width}% - 2px)`,
                  top: 6 + b.lane * (LANE_HEIGHT + LANE_GAP),
                  height: LANE_HEIGHT,
                  lineHeight: `${LANE_HEIGHT}px`,
                  background: b.e.color,
                  color: readableOn(b.e.color),
                  opacity: b.en <= nowMin ? 0.5 : 1,
                  animationDelay: `${i * 70}ms`,
                }}
              >
                {b.en - b.s >= 90 && <span className="block truncate max-sm:hidden">{b.e.title}</span>}
              </div>
            );
          })}
          {pins.map(({ a, m }) => (
            <span
              key={a.id}
              title={`${formatClock(new Date(a.due!))} 마감: ${a.title}`}
              className="absolute bottom-0 size-2.5 -translate-x-1/2 translate-y-1/2 rotate-45 bg-critical ring-2 ring-[var(--sky-bottom)]"
              style={{ left: `${pct(m)}%` }}
            />
          ))}
          {nowMin >= startMin && nowMin <= endMin && (
            <span className="absolute -inset-y-1 w-[2px] -translate-x-1/2 rounded-full bg-sun" style={{ left: `${nowPct}%` }}>
              <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-sun ring-2 ring-[var(--sky-top)]" />
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-hero-ink-2" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-[2px] bg-hero-ink-2 opacity-60" />
            일정
          </span>
          {pins.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rotate-45 bg-critical" />
              과제 마감
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[2px] rounded-full bg-sun" />
            지금 {formatClock(now)}
          </span>
        </div>
      </div>
    </div>
  );
}
