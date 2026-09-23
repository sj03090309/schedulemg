import { redirect } from "next/navigation";
import { SunMark } from "@/components/ui";
import { env, isGoogleConfigured } from "@/lib/env";
import { getSession } from "@/lib/session";

const ERRORS: Record<string, string> = {
  not_allowed: "허용되지 않은 계정이에요. 서버의 ALLOWED_EMAILS에 이 이메일을 추가하거나, 먼저 허용된 계정으로 로그인한 뒤 설정에서 연결하세요.",
  denied: "Google 권한 요청을 취소했어요. 다시 로그인하려면 아래 버튼을 누르세요.",
  state: "로그인 요청이 만료됐어요. 다시 시도하세요.",
  no_refresh:
    "Google이 장기 접근 권한을 주지 않았어요. myaccount.google.com/permissions 에서 이 앱의 권한을 삭제한 뒤 다시 로그인하세요.",
  oauth: "Google 로그인 중에 문제가 생겼어요. 잠시 뒤 다시 시도하세요.",
  not_configured: "Google 로그인이 아직 설정되지 않았어요.",
  session: "먼저 로그인하세요.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const session = await getSession();
  if (session && !session.dev) redirect("/");
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? ERRORS.oauth : null;
  const configured = isGoogleConfigured();
  // 배포 직후 흔히 빠뜨리는 값
  const missing = [
    env.sessionSecret.length < 16 && "SESSION_SECRET",
    env.allowedEmails.length === 0 && "ALLOWED_EMAILS",
  ].filter(Boolean);

  return (
    <main className="hero grid min-h-dvh place-items-center px-5 py-12" data-sky="dawn">
      <div className="w-full max-w-[420px]">
        <p className="flex items-center gap-2 text-[20px] font-bold tracking-[-0.02em]">
          <SunMark className="size-8" />
          오늘 브리핑
        </p>
        <h1 className="mt-6 text-[28px] font-bold leading-snug tracking-[-0.025em]">
          아침에 열면 오늘 할 일을 먼저 알려 드려요.
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-hero-ink-2">
          Google 계정으로 로그인하면 Gmail, 캘린더, 클래스룸을 한 화면에 모아 보여 줘요. 계정은 나중에 여러 개 더 연결할 수 있어요.
        </p>

        {typeof sp.logged_out === "string" && !error && (
          <p className="mt-5 rounded-xl bg-[var(--hero-track)] px-4 py-3 text-[14px]">로그아웃했어요.</p>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-critical-soft px-4 py-3 text-[14px] leading-relaxed text-ink">
            {error}
          </p>
        )}

        {configured && missing.length > 0 && (
          <p role="alert" className="mt-5 rounded-xl bg-warning-soft px-4 py-3 text-[14px] leading-relaxed text-ink">
            서버 환경 변수 {missing.join(", ")}이(가) 비어 있어서 로그인할 수 없어요. 값을 넣고 다시 배포하세요.
          </p>
        )}
        {configured ? (
          <a
            href="/api/auth/google/start"
            className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[16px] font-semibold text-paper hover:opacity-90"
          >
            Google로 로그인
          </a>
        ) : (
          <div className="mt-7 rounded-2xl bg-surface p-5 text-[14px] leading-relaxed text-ink-2">
            <p className="font-semibold text-ink">먼저 Google 로그인을 설정하세요</p>
            <p className="mt-2">
              서버 환경 변수에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, ALLOWED_EMAILS를 넣어야 해요. 자세한 순서는 README의
              ‘Google 설정’을 보세요.
            </p>
            <p className="mt-2">
              리디렉션 URI:{" "}
              <code className="break-all text-ink">{(env.appUrl || "https://내-도메인") + "/api/auth/google/callback"}</code>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
