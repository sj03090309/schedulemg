import { Check, ChevronDown, EyeOff, Flag, Laptop, Smartphone, Bell } from "lucide-react";
import { notificationAction } from "@/app/actions";
import { loadNotifications } from "@/lib/dashboard-data";
import type { NotificationItem } from "@/lib/notifications";
import { DAY, formatRelative } from "@/lib/time";
import { PendingButton } from "./client/pending-button";
import { Empty, Notice, Section } from "./ui";

const SOURCE = {
  mac: { icon: Laptop, label: "맥" },
  iphone: { icon: Smartphone, label: "iPhone" },
  android: { icon: Smartphone, label: "Android" },
  web: { icon: Bell, label: "웹" },
  other: { icon: Bell, label: "기타" },
} as const;

export async function NotificationsSection({ demo }: { demo: boolean }) {
  const notes = await loadNotifications(demo);
  if (notes.status !== "ok") {
    return (
      <Section id="notifications" title="기억할 알림">
        <Notice tone="error" message={notes.status === "error" ? notes.message : "알림을 불러오지 못했어요."} />
      </Section>
    );
  }

  const now = new Date();
  const items = notes.data;
  if (!items.length) {
    return (
      <Section id="notifications" title="기억할 알림">
        <Notice
          message="아직 받은 알림이 없어요. 맥 에이전트나 휴대폰 단축어를 연결하면 중요한 알림만 골라 여기에 모아 둘게요."
          action={{ href: "/settings#phone", label: "연결 방법 보기" }}
        />
      </Section>
    );
  }

  const important = items.filter((n) => n.importance === "high" && n.status === "open");
  const others = items.filter(
    (n) => n.importance === "normal" && n.status === "open" && now.getTime() - Date.parse(n.receivedAt) < DAY,
  );

  return (
    <Section id="notifications" title="기억할 알림" count={important.length}>
      {important.length === 0 ? (
        <Empty>새로 기억할 알림이 없어요.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {important.map((n) => (
            <NoteRow key={n.id} n={n} now={now} primary />
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details className="group mt-3">
          <summary className="flex cursor-pointer items-center gap-1 px-1 py-1 text-[13px] text-ink-3">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            중요하지 않다고 본 알림 {others.length}개 (최근 24시간)
          </summary>
          <ul className="mt-1 divide-y divide-line">
            {others.map((n) => (
              <NoteRow key={n.id} n={n} now={now} />
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function NoteRow({ n, now, primary }: { n: NotificationItem; now: Date; primary?: boolean }) {
  const Source = SOURCE[n.source] ?? SOURCE.other;
  return (
    <li className="py-3">
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1 font-medium text-ink-2">
          <Source.icon className="size-3.5" aria-label={Source.label} />
          {n.appName}
        </span>
        <span>{formatRelative(new Date(n.receivedAt), now)}</span>
        {primary && n.reasons.length > 0 && <span>{n.reasons.join(", ")} 때문에 골랐어요</span>}
      </p>
      {n.title && <p className="mt-1 text-[15px] font-medium leading-snug text-ink">{n.title}</p>}
      {n.subtitle && <p className="text-[14px] text-ink-2">{n.subtitle}</p>}
      {n.body && <p className="mt-0.5 line-clamp-3 text-[14px] leading-relaxed text-ink-2">{n.body}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {primary ? (
          <>
            <ActionButton id={n.id} action="done" label="확인했어요" icon={<Check className="size-3.5" aria-hidden />} />
            <ActionButton id={n.id} action="dismiss" label="숨기기" icon={<EyeOff className="size-3.5" aria-hidden />} quiet />
          </>
        ) : (
          <>
            <ActionButton id={n.id} action="important" label="기억할 알림으로" icon={<Flag className="size-3.5" aria-hidden />} />
            <ActionButton id={n.id} action="dismiss" label="숨기기" icon={<EyeOff className="size-3.5" aria-hidden />} quiet />
          </>
        )}
      </div>
    </li>
  );
}

function ActionButton({
  id,
  action,
  label,
  icon,
  quiet,
}: {
  id: string;
  action: string;
  label: string;
  icon: React.ReactNode;
  quiet?: boolean;
}) {
  return (
    <form action={notificationAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <PendingButton
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${
          quiet ? "text-ink-3 hover:bg-surface" : "bg-surface text-ink ring-1 ring-line hover:ring-ink-3"
        }`}
      >
        {icon}
        {label}
      </PendingButton>
    </form>
  );
}
