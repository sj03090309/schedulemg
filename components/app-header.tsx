import { Settings } from "lucide-react";
import Link from "next/link";
import { formatClock } from "@/lib/time";
import { RefreshButton } from "./client/refresh-button";
import { SunMark } from "./ui";

export function AppHeader({ now, demo, devMode }: { now: Date; demo: boolean; devMode: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-[color-mix(in_oklab,var(--paper)_82%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 px-4 sm:px-6">
        <Link href={demo ? "/?demo=1" : "/"} className="flex items-center gap-1.5 text-[17px] font-bold tracking-[-0.02em] text-ink">
          <SunMark className="size-6" />
          오늘
        </Link>
        {demo && (
          <span className="ml-1 rounded-full bg-sky-soft px-2.5 py-1 text-[12px] font-semibold text-ink">예시 화면</span>
        )}
        {devMode && !demo && (
          <span className="ml-1 rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-semibold text-warning-ink">
            로컬 개발 모드
          </span>
        )}
        <p className="ml-auto text-[13px] text-ink-3 tabular-nums">
          <span className="max-sm:sr-only">업데이트 </span>
          {formatClock(now)}
        </p>
        <RefreshButton />
        <Link href="/settings" aria-label="설정" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface">
          <Settings className="size-5" aria-hidden />
        </Link>
      </div>
    </header>
  );
}

const LINKS: [string, string][] = [
  ["remember", "잊지 말 것"],
  ["calendar", "일정"],
  ["assignments", "과제"],
  ["mail", "메일"],
  ["notifications", "알림"],
  ["notes", "메모"],
  ["ai", "AI 사용량"],
];

/** 휴대폰에서 긴 화면을 빨리 오가도록 섹션 바로가기를 둔다. */
export function SectionNav() {
  return (
    <nav
      aria-label="섹션 바로가기"
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex gap-2 py-1">
        {LINKS.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="block whitespace-nowrap rounded-full bg-surface px-3.5 py-2 text-[14px] text-ink-2 ring-1 ring-line"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
