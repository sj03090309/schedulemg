import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { SectionSkeleton } from "@/components/ui";
import { UsageSection } from "@/components/usage-section";
import { requireSession } from "@/lib/session";

export const metadata = { title: "AI 사용량 · 오늘 브리핑" };

/** Claude·Codex 남은 한도, 사용한 토큰, 원화 환산 금액 자세히 */
export default async function UsagePage({ searchParams }: PageProps<"/usage">) {
  const session = await requireSession();
  const demo = (await searchParams).demo === "1";
  return (
    <>
      <AppHeader now={new Date()} demo={demo} devMode={session.dev} />
      <main className="mx-auto max-w-[1080px] px-4 pb-[calc(env(safe-area-inset-bottom)+48px)] pt-4 sm:px-6 sm:pt-6">
        <Link href={demo ? "/?demo=1" : "/"} className="mb-4 inline-flex items-center gap-0.5 text-[14px] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          오늘로 돌아가기
        </Link>
        <Suspense fallback={<SectionSkeleton id="ai" title="AI 사용량" rows={2} />}>
          <UsageSection demo={demo} />
        </Suspense>
      </main>
    </>
  );
}
