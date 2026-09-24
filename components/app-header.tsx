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
