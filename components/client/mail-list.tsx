"use client";

import { Star } from "lucide-react";
import { useState } from "react";

export interface MailRow {
  id: string;
  account: string;
  from: string;
  subject: string;
  snippet: string;
  timeLabel: string;
  unread: boolean;
  important: boolean;
  starred: boolean;
  link: string;
}

export interface MailAccount {
  email: string;
  label: string;
  slot: number;
  unread: number;
}

const PAGE = 6;

/** 여러 Gmail 계정을 한 목록으로 보여 주고, 계정별로 걸러 볼 수 있게 한다. */
export function MailList({ items, accounts }: { items: MailRow[]; accounts: MailAccount[] }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const visible = filter === "all" ? items : items.filter((m) => m.account === filter);
  const shown = expanded ? visible : visible.slice(0, PAGE);
  const tagOf = new Map(accounts.map((a) => [a.email, a]));
  const totalUnread = accounts.reduce((s, a) => s + a.unread, 0);

  return (
    <>
      {accounts.length > 1 && (
        <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="계정별로 보기">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            전체 <span className="tabular-nums text-ink-3">{totalUnread}</span>
          </Chip>
          {accounts.map((a) => (
            <Chip key={a.email} active={filter === a.email} onClick={() => setFilter(a.email)}>
              <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--acct-${a.slot})` }} />
              {a.label} <span className="tabular-nums text-ink-3">{a.unread}</span>
            </Chip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-1 py-2 text-[14px] text-ink-3">최근 3일 동안 받은 메일이 없어요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((m) => {
            const tag = accounts.length > 1 ? tagOf.get(m.account) : undefined;
            return (
              <li key={`${m.account}:${m.id}`}>
                <a href={m.link} target="_blank" rel="noreferrer" className="group flex gap-2.5 py-3">
                  <span
                    aria-label={m.unread ? "읽지 않음" : undefined}
                    className={`mt-[7px] size-2 shrink-0 rounded-full ${m.unread ? "bg-sky" : "bg-transparent"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`truncate text-[14px] ${m.unread ? "font-semibold text-ink" : "text-ink-2"}`}>{m.from}</span>
                      <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{m.timeLabel}</span>
                    </span>
                    <span
                      className={`mt-0.5 block text-[15px] leading-snug group-hover:underline ${m.unread ? "font-medium text-ink" : "text-ink-2"}`}
                    >
                      {m.subject}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-[13px] text-ink-3">{m.snippet}</span>
                    {(m.important || m.starred || tag) && (
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[12px] text-ink-3">
                        {(m.important || m.starred) && (
                          <span className="inline-flex items-center gap-1 font-medium text-warning-ink">
                            <Star className="size-3" aria-hidden />
                            중요
                          </span>
                        )}
                        {tag && (
                          <span className="inline-flex items-center gap-1">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--acct-${tag.slot})` }} />
                            {tag.label}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > PAGE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 w-full rounded-xl py-2.5 text-[14px] font-medium text-ink-2 hover:bg-surface"
        >
          {expanded ? "접기" : `${visible.length - PAGE}통 더 보기`}
        </button>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition-colors ${
        active ? "bg-ink text-paper ring-ink [&_.text-ink-3]:text-paper/70" : "bg-surface text-ink-2 ring-line hover:ring-ink-3"
      }`}
    >
      {children}
    </button>
  );
}
