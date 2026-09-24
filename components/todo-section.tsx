import { Bell, Check, ChevronDown, GraduationCap, Mail, StickyNote } from "lucide-react";
import { addMemoAction, toggleItemAction } from "@/app/actions";
import type { TodoItem } from "@/lib/briefing";
import { loadBriefing } from "@/lib/dashboard-data";
import { PendingButton } from "./client/pending-button";
import { Section } from "./ui";

// 휴대폰에서도 한눈에 들어오게 급한 순서로 8개까지 먼저 보여 준다.
const VISIBLE = 8;

const KIND = {
  assignment: { icon: GraduationCap, label: "과제" },
  mail: { icon: Mail, label: "메일" },
  notification: { icon: Bell, label: "알림" },
  memo: { icon: StickyNote, label: "메모" },
} as const;

/** 할 일: 과제 마감, 규칙으로 고른 메일, 중요한 알림, 내 메모를 급한 순서로 한곳에 */
export async function TodoSection({ demo }: { demo: boolean }) {
  const b = await loadBriefing(demo);
  const open = b.todo;

  return (
    <Section id="todo" title="할 일" count={open.length || null}>
      <div className="overflow-hidden rounded-[20px] bg-surface">
        {open.length === 0 ? (
          <p className="px-5 py-5 text-[15px] leading-relaxed text-ink-2">지금 챙길 일이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {open.slice(0, VISIBLE).map((item) => (
              <TodoRow key={item.key} item={item} />
            ))}
          </ul>
        )}
        {open.length > VISIBLE && (
          <More label={`${open.length - VISIBLE}개 더 보기`}>
            {open.slice(VISIBLE).map((item) => (
              <TodoRow key={item.key} item={item} />
            ))}
          </More>
        )}
        {b.later.length > 0 && (
          <More label={`다음 주 이후 마감 ${b.later.length}개`}>
            {b.later.map((item) => (
              <TodoRow key={item.key} item={item} />
            ))}
          </More>
        )}
        <MemoForm />
      </div>
      {b.done.length > 0 && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer items-center gap-1 px-1 py-2 text-[13px] text-ink-3 hover:text-ink-2">
            오늘 끝낸 일 {b.done.length}개
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-line">
            {b.done.map((item) => (
              <TodoRow key={item.key} item={item} done />
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer items-center justify-center gap-1 py-3 text-[14px] font-medium text-ink-2 hover:bg-surface-2">
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">접기</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y divide-line border-t border-line">{children}</ul>
    </details>
  );
}

const TONE = {
  urgent: "font-semibold text-critical",
  soon: "font-semibold text-warning-ink",
  normal: "text-ink-2",
} as const;

function TodoRow({ item, done }: { item: TodoItem; done?: boolean }) {
  const Icon = KIND[item.kind].icon;
  return (
    <li className={`flex items-start gap-1 px-2 py-1.5 sm:px-3 ${done ? "text-ink-3" : ""}`}>
      <ToggleButton item={item} done={done} />
      <div className="min-w-0 flex-1 py-[9px]">
        <p className={`text-[15px] font-medium leading-snug ${done ? "line-through decoration-ink-3/60" : "text-ink"}`}>
          {item.href ? (
            <a href={item.href} target="_blank" rel="noreferrer" className="hover:underline">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </p>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-3">
          {item.when && !done && <span className={`shrink-0 tabular-nums ${TONE[item.tone]}`}>{item.when}</span>}
          <span className="inline-flex min-w-0 items-center gap-1">
            <Icon className="size-3.5 shrink-0" aria-label={KIND[item.kind].label} />
            <span className="truncate">{item.context}</span>
          </span>
        </p>
      </div>
    </li>
  );
}

function ToggleButton({ item, done }: { item: TodoItem; done?: boolean }) {
  const t = item.toggle;
  const ring = done ? "border-good bg-good text-white" : item.tone === "urgent" ? "border-critical" : "border-ink-3/70";
  return (
    <form action={toggleItemAction} className="shrink-0">
      <input type="hidden" name="type" value={t.type} />
      <input type="hidden" name="ref" value={t.type === "check" ? t.key : t.id} />
      <input type="hidden" name="current" value={done ? "done" : "open"} />
      <PendingButton
        aria-label={done ? `‘${item.title}’ 다시 할 일로` : `‘${item.title}’ 끝냄`}
        className="group grid size-11 place-items-center rounded-full"
      >
        <span className={`grid size-[22px] place-items-center rounded-full border-2 transition-colors group-hover:border-good ${ring}`}>
          {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </span>
      </PendingButton>
    </form>
  );
}

function MemoForm() {
  return (
    <form action={addMemoAction} className="flex items-center gap-2 border-t border-line px-3 py-3 sm:px-4">
      <input type="hidden" name="when" value="none" />
      <label htmlFor="memo-text" className="sr-only">
        할 일 추가
      </label>
      <input
        id="memo-text"
        name="text"
        required
        maxLength={300}
        autoComplete="off"
        placeholder="할 일 추가 (예: 10/2까지 책 반납)"
        className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-sky sm:text-[15px]"
      />
      <PendingButton className="shrink-0 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper hover:opacity-90">
        추가
      </PendingButton>
    </form>
  );
}
