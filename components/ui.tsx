import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AccountTag } from "@/lib/google/accounts";

export function Section({
  id,
  title,
  count,
  aside,
  children,
}: {
  id: string;
  title: string;
  count?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3 px-1">
        <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          {title}
          {count != null && count !== 0 && count !== "" && (
            <span className="ml-1.5 font-medium text-ink-3 tabular-nums">{count}</span>
          )}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 내부 페이지는 Link, API 라우트(Google 로그인 등)는 일반 a 태그 */
export function ActionLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const cls =
    className ??
    "inline-flex shrink-0 items-center justify-center rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-paper hover:opacity-90";
  if (href.startsWith("/api/") || href.startsWith("http")) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Notice({
  tone = "setup",
  message,
  action,
}: {
  tone?: "setup" | "error";
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-4 text-[14px] leading-relaxed sm:flex-row sm:items-center sm:justify-between ${
        tone === "error" ? "border-critical/50 text-ink" : "border-ink-3/40 text-ink-2"
      }`}
    >
      <p className="flex items-start gap-2">
        {tone === "error" ? (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        )}
        <span>{message}</span>
      </p>
      {action && <ActionLink href={action.href}>{action.label}</ActionLink>}
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mb-3 space-y-1 px-1 text-[13px] text-warning-ink">
      {items.map((w) => (
        <li key={w} className="flex gap-1.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

export function AccountBadge({ tag }: { tag?: AccountTag }) {
  if (!tag) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-ink-3">
      <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--acct-${tag.slot})` }} />
      {tag.label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-2 text-[14px] leading-relaxed text-ink-3">{children}</p>;
}

export function SectionSkeleton({ id, title, rows = 3 }: { id: string; title: string; rows?: number }) {
  return (
    <Section id={id} title={title}>
      <div className="space-y-2" aria-busy="true" aria-label={`${title} 불러오는 중`}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    </Section>
  );
}

export function SunMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M5 16a7 7 0 0 1 14 0Z" fill="var(--sun)" />
      <path d="M2.5 16h19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.5 19.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}
