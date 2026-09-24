import { ChevronDown, Mail, Megaphone, TriangleAlert } from "lucide-react";
import { getAccountTags, loadClassroom, loadMail } from "@/lib/dashboard-data";
import { isGoogleConfigured } from "@/lib/env";
import type { AccountTag } from "@/lib/google/accounts";
import type { Assignment } from "@/lib/google/classroom";
import type { MailItem } from "@/lib/google/gmail";
import { DAY, dateKey, formatRelative, formatTime, formatWhen, shiftDateKey } from "@/lib/time";
import { AccountBadge, Empty, Notice, Section, Warnings } from "./ui";

interface Group {
  id: string;
  title: string;
  urgent?: boolean;
  items: Assignment[];
}

/**
 * 과제 칸: 클래스룸 과제(연결된 경우)와, Claude가 메일(학교 메일 전달 포함)에서 찾은 마감을 모은다.
 * 클래스룸 권한이 없어도 메일에서 찾은 마감으로 채운다.
 */
export async function AssignmentsSection({ demo }: { demo: boolean }) {
  const [classroom, tags, mail] = await Promise.all([loadClassroom(demo), getAccountTags(demo), loadMail(demo)]);
  const now = new Date();
  const fromMail = mail.status === "ok" ? mailDeadlines(mail.data.items, now) : [];

  if (classroom.status !== "ok") {
    if (!isGoogleConfigured()) {
      return (
        <Section id="assignments" title="과제">
          <Notice
            message={classroom.status === "setup" ? classroom.message : "과제를 불러오지 못했어요."}
            action={classroom.status === "setup" ? classroom.action : undefined}
          />
        </Section>
      );
    }
    return (
      <Section id="assignments" title="과제" count={fromMail.length || null}>
        {classroom.status === "error" && <Warnings items={[classroom.message]} />}
        {fromMail.length > 0 ? <MailDeadlines items={fromMail} /> : <Empty>다가오는 마감이 없어요.</Empty>}
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-3">
          메일에서 찾은 과제와 마감을 모아 보여 줘요. 학교 과제 알림을 받는 방법은{" "}
          <a href="/settings#classroom-forward" className="font-medium text-sky hover:underline">
            설정
          </a>
          에 있어요.
        </p>
      </Section>
    );
  }

  const aside = (
    <a href="https://classroom.google.com/a/not-turned-in/all" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-sky hover:underline">
      클래스룸 열기
    </a>
  );
  const nowMs = now.getTime();
  const today = dateKey(now);
  const tomorrow = shiftDateKey(today, 1);
  const multi = Object.keys(tags).length > 1;
  const pending = classroom.data.assignments.filter((a) => !a.submitted);
  const due = (a: Assignment) => Date.parse(a.due!);
  const withDue = pending.filter((a) => a.due);

  const groups: Group[] = [
    { id: "overdue", title: "마감 지남", urgent: true, items: withDue.filter((a) => due(a) < nowMs).reverse() },
    { id: "today", title: "오늘 마감", urgent: true, items: withDue.filter((a) => due(a) >= nowMs && dateKey(new Date(due(a))) === today) },
    { id: "tomorrow", title: "내일 마감", items: withDue.filter((a) => dateKey(new Date(due(a))) === tomorrow) },
    {
      id: "week",
      title: "이번 주",
      items: withDue.filter((a) => {
        const k = dateKey(new Date(due(a)));
        return k > tomorrow && due(a) < nowMs + 7 * DAY;
      }),
    },
    { id: "later", title: "나중에", items: withDue.filter((a) => due(a) >= nowMs + 7 * DAY && dateKey(new Date(due(a))) > tomorrow) },
    { id: "nodue", title: "마감 없음", items: pending.filter((a) => !a.due) },
  ].filter((g) => g.items.length);

  const recentlySubmitted = classroom.data.assignments.filter(
    (a) => a.submitted && a.due && Math.abs(due(a) - nowMs) < 7 * DAY,
  ).length;
  const announcements = classroom.data.announcements.slice(0, 3);

  return (
    <Section id="assignments" title="과제" count={pending.length + fromMail.length} aside={aside}>
      <Warnings items={classroom.warnings} />
      {groups.length === 0 && fromMail.length === 0 ? (
        <Empty>
          제출할 과제가 없어요. 수업 {classroom.data.courseCount}개를 확인했어요.
        </Empty>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <h3
                className={`mb-1 flex items-center gap-1.5 px-1 text-[13px] font-semibold ${g.urgent ? "text-critical" : "text-ink-2"}`}
              >
                {g.urgent && <TriangleAlert className="size-3.5" aria-hidden />}
                {g.title}
                <span className="font-normal text-ink-3 tabular-nums">{g.items.length}</span>
              </h3>
              <ul className="divide-y divide-line">
                {g.items.map((a) => (
                  <AssignmentRow key={`${a.account}:${a.id}`} a={a} now={now} tag={multi ? tags[a.account] : undefined} groupId={g.id} />
                ))}
              </ul>
            </div>
          ))}
          {fromMail.length > 0 && (
            <div>
              <MailDeadlines items={fromMail} />
            </div>
          )}
        </div>
      )}
      {recentlySubmitted > 0 && (
        <p className="mt-3 px-1 text-[13px] text-ink-3">최근 일주일 동안 제출한 과제 {recentlySubmitted}개</p>
      )}

      {announcements.length > 0 && (
        <details className="group mt-5" open={announcements.length <= 2}>
          <summary className="flex cursor-pointer items-center gap-1.5 px-1 py-1 text-[13px] font-semibold text-ink-2">
            <Megaphone className="size-3.5" aria-hidden />
            최근 공지
            <span className="font-normal text-ink-3 tabular-nums">{announcements.length}</span>
            <ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-1 divide-y divide-line">
            {announcements.map((n) => (
              <li key={`${n.account}:${n.id}`} className="py-2.5">
                <a href={n.link} target="_blank" rel="noreferrer" className="block text-[14px] leading-relaxed text-ink hover:underline">
                  {n.text}
                </a>
                <p className="mt-1 flex flex-wrap gap-x-2.5 text-[12px] text-ink-3">
                  <span>{n.course}</span>
                  <span>{formatRelative(new Date(n.createdAt), now)}</span>
                  <AccountBadge tag={multi ? tags[n.account] : undefined} />
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function MailDeadlines({ items }: { items: ReturnType<typeof mailDeadlines> }) {
  return (
    <>
      <h3 className="mb-1 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-ink-2">
        <Mail className="size-3.5" aria-hidden />
        메일에서 찾은 마감
        <span className="font-normal text-ink-3 tabular-nums">{items.length}</span>
      </h3>
      <ul className="divide-y divide-line">
        {items.map((m) => (
          <li key={`${m.account}:${m.id}`} className="py-2.5">
            <a href={m.link} target="_blank" rel="noreferrer" className="block text-[15px] font-medium leading-snug text-ink hover:underline">
              {m.insight?.action ?? m.subject}
            </a>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
              <span className={m.urgent ? "font-semibold text-critical" : "font-medium text-ink-2"}>{m.dueLabel}</span>
              <span className="min-w-0 break-words">{m.insight?.summary}</span>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Claude가 마감을 찾은 중요한 메일 (마감이 지나지 않은 것, 가까운 순) */
function mailDeadlines(items: MailItem[], now: Date) {
  const nowMs = now.getTime();
  return items
    .filter((m) => m.insight?.important && m.insight.due && Date.parse(m.insight.due) > nowMs - DAY)
    .map((m) => {
      const due = new Date(m.insight!.due!);
      return {
        ...m,
        dueLabel: due.getTime() < nowMs ? `${formatWhen(due, now)} 마감 지남` : `${formatWhen(due, now)} 마감`,
        urgent: due.getTime() - nowMs < DAY,
        dueMs: due.getTime(),
      };
    })
    .sort((a, b) => a.dueMs - b.dueMs)
    .slice(0, 8);
}

function AssignmentRow({ a, now, tag, groupId }: { a: Assignment; now: Date; tag?: AccountTag; groupId: string }) {
  const dueDate = a.due ? new Date(a.due) : null;
  const dueLabel = !dueDate
    ? "마감일 없음"
    : groupId === "today"
      ? `오늘 ${formatTime(dueDate)}`
      : `${formatWhen(dueDate, now)}${a.dueHasTime ? "" : "까지"}`;
  return (
    <li className="py-2.5">
      <a href={a.link} target="_blank" rel="noreferrer" className="block text-[15px] font-medium leading-snug text-ink hover:underline">
        {a.title}
      </a>
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
        <span className={groupId === "overdue" || groupId === "today" ? "font-medium text-ink-2" : undefined}>{dueLabel}</span>
        <span>{a.course}</span>
        {a.late && <span className="font-medium text-warning-ink">늦게 제출됨</span>}
        <AccountBadge tag={tag} />
      </p>
    </li>
  );
}
