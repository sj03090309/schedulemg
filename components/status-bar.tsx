import { ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getAccountTags, loadMac, loadMail, loadUsage } from "@/lib/dashboard-data";
import { formatKRW } from "@/lib/text";
import { MINUTE, formatRelative } from "@/lib/time";
import type { ProviderView } from "@/lib/usage/summary";

/** 맨 아래 한 줄: 안 읽은 메일 수와 AI 사용량 요약, 에이전트 문제 */
export async function StatusBar({ demo }: { demo: boolean }) {
  const [mail, usage, tags, mac] = await Promise.all([loadMail(demo), loadUsage(demo), getAccountTags(demo), loadMac(demo)]);
  const now = new Date();

  const problems: string[] = [];
  if (usage.macNotifications && !usage.macNotifications.available && usage.macNotifications.error) {
    problems.push(`맥 알림을 읽지 못해요: ${usage.macNotifications.error}`);
  }
  if (mac?.calendar && !mac.calendar.available && mac.calendar.error) problems.push(mac.calendar.error);
  if (mac?.notes && !mac.notes.available && mac.notes.error) problems.push(mac.notes.error);
  if (usage.lastReportAt && now.getTime() - Date.parse(usage.lastReportAt) > 30 * MINUTE) {
    problems.push(`맥 에이전트의 마지막 보고가 ${formatRelative(new Date(usage.lastReportAt), now)}예요. 맥이 잠자기 중일 수 있어요.`);
  }

  return (
    <footer className="mt-10 border-t border-line pt-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[18px] bg-surface px-4 py-3.5">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold text-ink">메일</span>
            <a href="https://mail.google.com" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-sky hover:underline">
              Gmail 열기
            </a>
          </p>
          {mail.status === "ok" ? (
            <>
              <p className="mt-1 text-[14px] text-ink-2">
                안 읽은 메일 <strong className="font-semibold text-ink tabular-nums">{mail.data.totalUnread}</strong>통
                <span className="text-ink-3"> · 챙길 메일은 할 일에 있어요</span>
              </p>
              {Object.keys(mail.data.unreadByAccount).length > 1 && (
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-3">
                  {Object.entries(mail.data.unreadByAccount).map(([email, n]) => (
                    <li key={email}>
                      <a href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                        <span aria-hidden className="mr-1 inline-block size-2 rounded-full" style={{ background: `var(--acct-${tags[email]?.slot ?? 0})` }} />
                        {tags[email]?.label ?? email} <span className="tabular-nums">{n}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{mail.message}</p>
          )}
        </div>

        <Link
          href={demo ? "/usage?demo=1" : "/usage"}
          className="group block rounded-[18px] bg-surface px-4 py-3.5 ring-line hover:ring-1"
        >
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold text-ink">AI 사용량</span>
            <span className="inline-flex items-center text-[13px] font-medium text-sky">
              자세히
              <ChevronRight className="size-3.5" aria-hidden />
            </span>
          </p>
          {usage.hasAgent ? (
            <dl className="mt-1.5 space-y-1">
              <UsageLine p={usage.claude} />
              <UsageLine p={usage.codex} />
            </dl>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">맥 에이전트를 연결하면 남은 한도와 원화 금액이 보여요.</p>
          )}
        </Link>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 px-1 text-[13px] text-warning-ink">
          {problems.map((p) => (
            <li key={p} className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {p}{" "}
                <Link href="/settings#agent" className="font-medium underline">
                  확인
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}

const LEVEL = { ok: "text-ink", warning: "text-warning-ink", critical: "text-critical" } as const;

function UsageLine({ p }: { p: ProviderView }) {
  const windows = p.limits?.windows.filter((w) => !w.hasReset) ?? [];
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="w-[52px] shrink-0 font-medium text-ink">{p.name}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 text-ink-3">
        {p.status !== "ok" ? (
          <span>기록 없음</span>
        ) : windows.length ? (
          windows.map((w) => (
            <span key={w.id}>
              {w.label} <strong className={`font-semibold tabular-nums ${LEVEL[w.level]}`}>{Math.round(w.remainingPercent)}%</strong> 남음
            </span>
          ))
        ) : (
          <span>한도 정보 없음</span>
        )}
      </dd>
      {p.status === "ok" && <dd className="shrink-0 text-ink-3 tabular-nums">오늘 {formatKRW(p.today.costKRW)}</dd>}
    </div>
  );
}
