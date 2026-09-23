import { Suspense } from "react";
import { AccountAlerts } from "@/components/account-alerts";
import { AppHeader, SectionNav } from "@/components/app-header";
import { BriefingHero, HeroSkeleton } from "@/components/briefing-hero";
import { CalendarSection } from "@/components/calendar-section";
import { ClassroomSection } from "@/components/classroom-section";
import { AutoRefresh } from "@/components/client/auto-refresh";
import { MailSection } from "@/components/mail-section";
import { NotificationsSection } from "@/components/notifications-section";
import { RememberSection } from "@/components/remember-section";
import { SectionSkeleton } from "@/components/ui";
import { UsageSection } from "@/components/usage-section";
import { requireSession } from "@/lib/session";
import type { SkyPhase } from "@/lib/time";

const SKIES: SkyPhase[] = ["dawn", "day", "dusk", "night"];

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await requireSession();
  const params = await searchParams;
  const demo = params.demo === "1";
  const sky = demo && typeof params.sky === "string" && SKIES.includes(params.sky as SkyPhase) ? (params.sky as SkyPhase) : undefined;
  const now = new Date();

  return (
    <>
      <AppHeader now={now} demo={demo} devMode={session.dev} />
      <main className="mx-auto max-w-[1320px] px-4 pb-[calc(env(safe-area-inset-bottom)+56px)] pt-4 sm:px-6 sm:pt-6">
        <Suspense fallback={null}>
          <AccountAlerts demo={demo} />
        </Suspense>
        <Suspense fallback={<HeroSkeleton />}>
          <BriefingHero demo={demo} sky={sky} />
        </Suspense>

        <div className="mt-4">
          <SectionNav />
        </div>

        {/* 휴대폰: 한 줄 / 태블릿: 두 줄 / 넓은 화면: 세 줄 */}
        <div className="mt-6 grid gap-x-8 gap-y-10 md:mt-8 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-10">
            <Suspense fallback={<SectionSkeleton id="remember" title="잊지 말 것" rows={4} />}>
              <RememberSection demo={demo} />
            </Suspense>
            <Suspense fallback={<SectionSkeleton id="calendar" title="오늘 일정" />}>
              <CalendarSection demo={demo} />
            </Suspense>
          </div>
          <div className="min-w-0 space-y-10">
            <Suspense fallback={<SectionSkeleton id="classroom" title="과제" />}>
              <ClassroomSection demo={demo} />
            </Suspense>
            <Suspense fallback={<SectionSkeleton id="mail" title="메일" rows={4} />}>
              <MailSection demo={demo} />
            </Suspense>
          </div>
          <div className="min-w-0 space-y-10 md:col-span-2 xl:col-span-1">
            <Suspense fallback={<SectionSkeleton id="notifications" title="기억할 알림" />}>
              <NotificationsSection demo={demo} />
            </Suspense>
            <Suspense fallback={<SectionSkeleton id="ai" title="AI 사용량" rows={2} />}>
              <UsageSection demo={demo} />
            </Suspense>
          </div>
        </div>
      </main>
      <AutoRefresh />
    </>
  );
}
