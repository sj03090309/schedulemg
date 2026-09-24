import { Suspense } from "react";
import { AccountAlerts } from "@/components/account-alerts";
import { AppHeader } from "@/components/app-header";
import { AutoRefresh } from "@/components/client/auto-refresh";
import { LiveUpdates } from "@/components/client/live-updates";
import { NotesSection } from "@/components/notes-section";
import { ScheduleSection } from "@/components/schedule-section";
import { StatusBar } from "@/components/status-bar";
import { TodaySummary, TodaySummarySkeleton } from "@/components/today-summary";
import { TodoSection } from "@/components/todo-section";
import { SectionSkeleton } from "@/components/ui";
import { getVersion } from "@/lib/live";
import { requireSession } from "@/lib/session";

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await requireSession();
  const demo = (await searchParams).demo === "1";
  const now = new Date();
  // 지금 화면이 어떤 데이터 버전으로 그려졌는지. 이후 바뀌면 LiveUpdates가 새로 그린다.
  const version = demo ? "demo" : await getVersion().catch(() => "0");

  return (
    <>
      <AppHeader now={now} demo={demo} devMode={session.dev} />
      <main className="mx-auto max-w-[1080px] px-4 pb-[calc(env(safe-area-inset-bottom)+48px)] pt-5 sm:px-6 sm:pt-8">
        <Suspense fallback={null}>
          <AccountAlerts demo={demo} />
        </Suspense>
        <Suspense fallback={<TodaySummarySkeleton />}>
          <TodaySummary demo={demo} />
        </Suspense>

        {/* 휴대폰: 일정 → 할 일 → 메모 / 넓은 화면: 왼쪽 일정·메모, 오른쪽 할 일 */}
        <div className="mt-7 grid gap-x-10 gap-y-9 md:mt-9 md:grid-cols-2 md:grid-rows-[auto_1fr]">
          <div className="min-w-0 md:col-start-1 md:row-start-1">
            <Suspense fallback={<SectionSkeleton id="schedule" title="오늘 일정" />}>
              <ScheduleSection demo={demo} />
            </Suspense>
          </div>
          <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1">
            <Suspense fallback={<SectionSkeleton id="todo" title="할 일" rows={4} />}>
              <TodoSection demo={demo} />
            </Suspense>
          </div>
          <div className="min-w-0 md:col-start-1 md:row-start-2">
            <Suspense fallback={null}>
              <NotesSection demo={demo} />
            </Suspense>
          </div>
        </div>

        <Suspense fallback={null}>
          <StatusBar demo={demo} />
        </Suspense>
      </main>
      <AutoRefresh />
      {!demo && <LiveUpdates version={version} />}
    </>
  );
}
