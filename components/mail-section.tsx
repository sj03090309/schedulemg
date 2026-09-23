import { getAccountTags, loadMail } from "@/lib/dashboard-data";
import { DAY, dayDiff, formatShortDate, formatTime, formatWhen } from "@/lib/time";
import { MailList, type MailAccount, type MailRow } from "./client/mail-list";
import { Notice, Section, Warnings } from "./ui";

export async function MailSection({ demo }: { demo: boolean }) {
  const [mail, tags] = await Promise.all([loadMail(demo), getAccountTags(demo)]);
  const aside = (
    <a href="https://mail.google.com" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-sky hover:underline">
      Gmail 열기
    </a>
  );

  if (mail.status !== "ok") {
    return (
      <Section id="mail" title="메일" aside={aside}>
        <Notice tone={mail.status === "error" ? "error" : "setup"} message={mail.message} action={mail.status === "setup" ? mail.action : undefined} />
      </Section>
    );
  }

  const now = new Date();
  // 시간 표기는 서버에서 만들어 넘겨야 화면이 서버와 브라우저에서 똑같이 그려진다.
  const rows: MailRow[] = mail.data.items.map((m) => {
    const date = new Date(m.date);
    const diff = dayDiff(date, now);
    const due = m.insight?.due ? new Date(m.insight.due) : null;
    return {
      id: m.id,
      account: m.account,
      from: m.from,
      subject: m.subject,
      snippet: m.insight?.summary || m.snippet,
      timeLabel: diff === 0 ? formatTime(date) : diff === -1 ? "어제" : formatShortDate(date),
      unread: m.unread,
      important: m.important,
      starred: m.starred,
      link: m.link,
      highlight: Boolean(m.insight?.important),
      summarized: Boolean(m.insight),
      action: m.insight?.action ?? null,
      dueLabel: due ? (due.getTime() < now.getTime() ? "마감 지남" : `${formatWhen(due, now)} 마감`) : null,
      dueUrgent: due ? due.getTime() - now.getTime() < DAY : false,
    };
  });
  const anySummary = rows.some((r) => r.summarized);
  const accounts: MailAccount[] = Object.values(tags)
    .filter((t) => mail.data.unreadByAccount[t.email] !== undefined)
    .map((t) => ({ ...t, unread: mail.data.unreadByAccount[t.email] ?? 0 }));

  return (
    <Section
      id="mail"
      title="메일"
      count={mail.data.totalUnread ? `읽지 않음 ${mail.data.totalUnread.toLocaleString("ko-KR")}` : null}
      aside={aside}
    >
      <Warnings items={mail.warnings} />
      <MailList items={rows} accounts={accounts} />
      {!anySummary && rows.length > 0 && !demo && (
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-3">
          맥 에이전트가 켜져 있으면 몇 분 안에 Claude가 중요한 메일을 골라 요약해 드려요.
        </p>
      )}
    </Section>
  );
}
