import { Bell, Check, ChevronDown, Clock, GraduationCap, Mail, Sparkles, StickyNote, Trash2, TriangleAlert } from "lucide-react";
import { addMemoAction, deleteMemoAction, toggleItemAction } from "@/app/actions";
import type { RememberItem } from "@/lib/briefing";
import { getAccountTags, loadBriefing } from "@/lib/dashboard-data";
import type { AccountTag } from "@/lib/google/accounts";
import { dayLabel, startOfDay } from "@/lib/time";
import { PendingButton } from "./client/pending-button";
import { AccountBadge, Section } from "./ui";

// 휴대폰에서 일정까지 너무 멀지 않게, 급한 순서로 7개만 먼저 보여 준다.
const VISIBLE = 7;

const KIND = {
  assignment: { icon: GraduationCap, label: "과제" },
  mail: { icon: Mail, label: "메일" },
  notification: { icon: Bell, label: "알림" },
  memo: { icon: StickyNote, label: "메모" },
  usage: { icon: Sparkles, label: "AI 한도" },
} as const;

export async function RememberSection({ demo }: { demo: boolean }) {
  const [briefing, tags] = await Promise.all([loadBriefing(demo), getAccountTags(demo)]);
  const multi = Object.keys(tags).length > 1;
  const open = briefing.items.filter((i) => !i.done);
  const done = briefing.items.filter((i) => i.done);

  return (
    <Section id="remember" title="잊지 말 것" count={open.length}>
      <div className="overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_0_var(--line),0_18px_40px_-30px_rgba(23,32,43,0.45)]">
        {open.length === 0 ? (
          <p className="px-5 py-5 text-[15px] leading-relaxed text-ink-2">
            지금 챙길 일이 없어요. 마감, 중요한 메일과 알림이 생기면 여기에 모아 둘게요.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {open.slice(0, VISIBLE).map((item) => (
                <RememberRow key={item.key} item={item} tag={multi && item.account ? tags[item.account] : undefined} />
              ))}
            </ul>
            {open.length > VISIBLE && (
              <details className="group border-t border-line">
                <summary className="flex cursor-pointer items-center justify-center gap-1 py-3 text-[14px] font-medium text-ink-2 hover:bg-surface-2">
                  <span className="group-open:hidden">나머지 {open.length - VISIBLE}개 더 보기</span>
                  <span className="hidden group-open:inline">접기</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {open.slice(VISIBLE).map((item) => (
                    <RememberRow key={item.key} item={item} tag={multi && item.account ? tags[item.account] : undefined} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {done.length > 0 && (
          <ul className="divide-y divide-line border-t border-line bg-surface-2">
            {done.map((item) => (
              <RememberRow key={item.key} item={item} />
            ))}
          </ul>
        )}
        <MemoForm />
      </div>

      {briefing.upcomingMemos.length > 0 && (
        <details className="group mt-3 px-1">
          <summary className="inline-flex cursor-pointer items-center gap-1 py-1 text-[13px] text-ink-3">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            다가오는 메모 {briefing.upcomingMemos.length}개
          </summary>
          <ul className="mt-1 divide-y divide-line">
            {briefing.upcomingMemos.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-[14px]">
                <span className="min-w-0 flex-1 text-ink-2">{m.text}</span>
                <span className="shrink-0 text-[13px] text-ink-3">{dayLabel(startOfDay(m.date!))}</span>
                <form action={deleteMemoAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <PendingButton aria-label={`${m.text} 메모 삭제`} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-surface">
                    <Trash2 className="size-4" aria-hidden />
                  </PendingButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function RememberRow({ item, tag }: { item: RememberItem; tag?: AccountTag }) {
  const Icon = KIND[item.kind].icon;
  return (
    <li className={`flex items-start gap-2 px-3 py-3 sm:px-4 ${item.done ? "text-ink-3" : ""}`}>
      <ToggleButton item={item} />
      <div className="min-w-0 flex-1 pt-[9px]">
        <p className={`text-[15px] font-medium leading-snug ${item.done ? "line-through decoration-ink-3/60" : "text-ink"}`}>
          {item.href ? (
            <a href={item.href} target="_blank" rel="noreferrer" className="hover:underline">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
          {item.when && !item.done && <When item={item} />}
          <span className="inline-flex items-center gap-1">
            <Icon className="size-3.5" aria-hidden />
            {KIND[item.kind].label}
          </span>
          {item.context && <span className="min-w-0 break-words">{item.context}</span>}
          <AccountBadge tag={tag} />
        </p>
      </div>
    </li>
  );
}

function When({ item }: { item: RememberItem }) {
  if (item.tone === "urgent") {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-critical">
        <TriangleAlert className="size-3.5" aria-hidden />
        {item.when}
      </span>
    );
  }
  if (item.tone === "soon") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-warning-ink">
        <Clock className="size-3.5" aria-hidden />
        {item.when}
      </span>
    );
  }
  return <span className="font-medium text-ink-2">{item.when}</span>;
}

function ToggleButton({ item }: { item: RememberItem }) {
  if (!item.toggle) {
    return (
      <span className="grid size-11 shrink-0 place-items-center text-ink-3" aria-hidden>
        <Sparkles className="size-[18px]" />
      </span>
    );
  }
  const t = item.toggle;
  const ref = t.type === "check" ? t.key : t.id;
  const ring = item.done
    ? "border-good bg-good text-white"
    : item.tone === "urgent"
      ? "border-critical"
      : "border-ink-3/70";
  return (
    <form action={toggleItemAction} className="shrink-0">
      <input type="hidden" name="type" value={t.type} />
      <input type="hidden" name="ref" value={ref} />
      <input type="hidden" name="current" value={item.done ? "done" : "open"} />
      <PendingButton
        aria-label={item.done ? `‘${item.title}’ 다시 할 일로` : `‘${item.title}’ 완료`}
        className="group grid size-11 place-items-center rounded-full"
      >
        <span className={`grid size-[22px] place-items-center rounded-full border-2 transition-colors group-hover:border-good ${ring}`}>
          {item.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </span>
      </PendingButton>
    </form>
  );
}

function MemoForm() {
  return (
    <form action={addMemoAction} className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3 sm:px-4">
      <label htmlFor="memo-text" className="sr-only">
        기억할 것
      </label>
      <input
        id="memo-text"
        name="text"
        required
        maxLength={300}
        autoComplete="off"
        placeholder="기억할 것 적기"
        className="min-w-0 flex-1 basis-48 rounded-xl bg-surface-2 px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-sky sm:text-[15px]"
      />
      <label htmlFor="memo-when" className="sr-only">
        언제 볼까요
      </label>
      <select
        id="memo-when"
        name="when"
        defaultValue="today"
        className="rounded-xl bg-surface-2 px-3 py-2.5 text-base text-ink-2 sm:text-[14px]"
      >
        <option value="today">오늘</option>
        <option value="tomorrow">내일</option>
        <option value="none">날짜 없이</option>
      </select>
      <PendingButton className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper hover:opacity-90">
        추가
      </PendingButton>
    </form>
  );
}
