import { ChevronLeft, CircleCheck, TriangleAlert } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  removeAccountAction,
  removeHostAction,
  renameAccountAction,
  resetRulesAction,
  saveRulesAction,
} from "@/app/actions";
import { PendingButton } from "@/components/client/pending-button";
import { CopyButton, SecretField } from "@/components/client/secret-field";
import { SunMark } from "@/components/ui";
import { getAccounts } from "@/lib/dashboard-data";
import { env, isGoogleConfigured } from "@/lib/env";
import { accountTags, needsRegrant } from "@/lib/google/accounts";
import { ALL_SERVICES, SERVICE_LABELS, grantedServices } from "@/lib/google/oauth";
import { DEFAULT_RULES, getRules } from "@/lib/notifications";
import { requireSession } from "@/lib/session";
import { getKV } from "@/lib/store/kv";
import { formatRelative } from "@/lib/time";
import { loadUsageReports, reportKey } from "@/lib/usage/store";

export const metadata = { title: "설정 | 오늘 브리핑" };

const ERRORS: Record<string, string> = {
  denied: "Google 권한 요청을 취소했어요.",
  state: "연결 요청이 만료됐어요. 다시 시도하세요.",
  no_refresh: "Google이 장기 접근 권한을 주지 않았어요. myaccount.google.com/permissions 에서 이 앱의 권한을 지운 뒤 다시 연결하세요.",
  oauth: "Google 계정을 연결하지 못했어요. 학교·회사 계정은 관리자가 외부 앱을 막아 둔 경우가 있어요.",
  session: "로그인이 만료됐어요. 다시 로그인하세요.",
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const session = await requireSession();
  const sp = await searchParams;
  const [accounts, reports, rules] = await Promise.all([
    getAccounts(),
    loadUsageReports().catch(() => []),
    getRules().catch(() => DEFAULT_RULES),
  ]);
  const h = await headers();
  const origin = env.appUrl || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3300"}`;
  const tags = accountTags(accounts);
  const kv = getKV();
  const configured = isGoogleConfigured();
  const now = new Date();
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? ERRORS.oauth : null;
  const ingestUrl = `${origin}/api/ingest/notifications`;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-[color-mix(in_oklab,var(--paper)_82%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[860px] items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-2 text-[15px] font-medium text-ink-2 hover:bg-surface">
            <ChevronLeft className="size-5" aria-hidden />
            오늘 화면
          </Link>
          <p className="ml-auto flex items-center gap-1.5 text-[15px] font-semibold">
            <SunMark className="size-5" />
            설정
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[860px] space-y-12 px-4 pb-[calc(env(safe-area-inset-bottom)+64px)] pt-6 sm:px-6">
        {sp.linked === "1" && <Banner tone="ok">Google 계정을 연결했어요. 오늘 화면에 바로 반영돼요.</Banner>}
        {error && <Banner tone="error">{error}</Banner>}

        <Block id="google" title="Google 계정" lead="계정을 여러 개 연결하면 Gmail, 캘린더, 클래스룸을 모두 한 화면에 합쳐 보여 줘요. 별명을 붙이면 어느 계정에서 온 항목인지 색과 이름으로 구분돼요.">
          {!configured ? (
            <GoogleSetupGuide origin={origin} />
          ) : (
            <>
              {accounts.length === 0 ? (
                <p className="text-[14px] text-ink-3">아직 연결된 계정이 없어요.</p>
              ) : (
                <ul className="divide-y divide-line rounded-2xl bg-surface">
                  {accounts.map((a) => {
                    const tag = tags[a.email];
                    const granted = grantedServices(a.scope);
                    return (
                      <li key={a.email} className="space-y-3 p-4 sm:p-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span aria-hidden className="size-3 rounded-full" style={{ background: `var(--acct-${tag.slot})` }} />
                          <p className="text-[16px] font-semibold text-ink">{tag.label}</p>
                          <p className="min-w-0 break-all text-[14px] text-ink-3">{a.email}</p>
                          {session.email === a.email && <span className="text-[12px] text-ink-3">(로그인한 계정)</span>}
                        </div>
                        <p className="flex flex-wrap gap-2 text-[13px]">
                          {ALL_SERVICES.map((s) => (
                            <span
                              key={s}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                                granted.includes(s) ? "bg-surface-2 text-ink" : "bg-surface-2 text-ink-3 line-through"
                              }`}
                            >
                              {granted.includes(s) && <CircleCheck className="size-3.5 text-good-ink" aria-hidden />}
                              {SERVICE_LABELS[s]}
                            </span>
                          ))}
                        </p>
                        {a.needsReauth && (
                          <p className="flex items-start gap-1.5 text-[13px] text-critical">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            {a.lastError ?? "다시 연결해야 해요."}
                          </p>
                        )}
                        {needsRegrant(a) && (
                          <p className="flex items-start gap-1.5 text-[13px] text-warning-ink">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            테스트 모드에서 받은 권한이라 7일 뒤 만료돼요. ‘권한 다시 받기’를 한 번 눌러 주세요.
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={renameAccountAction} className="flex items-center gap-2">
                            <input type="hidden" name="email" value={a.email} />
                            <label htmlFor={`label-${a.email}`} className="sr-only">
                              {a.email} 별명
                            </label>
                            <input
                              id={`label-${a.email}`}
                              name="label"
                              defaultValue={a.label ?? ""}
                              placeholder="별명 (예: 학교)"
                              maxLength={20}
                              className="w-36 rounded-xl bg-surface-2 px-3 py-2 text-base sm:text-[14px]"
                            />
                            <PendingButton className="rounded-xl px-3 py-2 text-[14px] font-medium text-ink ring-1 ring-line hover:ring-ink-3">
                              별명 저장
                            </PendingButton>
                          </form>
                          <a
                            href={`/api/auth/google/start?mode=link&hint=${encodeURIComponent(a.email)}`}
                            className="rounded-xl px-3 py-2 text-[14px] font-medium text-sky hover:bg-surface-2"
                          >
                            권한 다시 받기
                          </a>
                          <details className="group">
                            <summary className="cursor-pointer rounded-xl px-3 py-2 text-[14px] font-medium text-ink-3 hover:bg-surface-2">
                              연결 해제
                            </summary>
                            <form action={removeAccountAction} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-critical-soft p-3 text-[13px]">
                              <input type="hidden" name="email" value={a.email} />
                              <span className="text-ink">이 계정의 메일, 일정, 과제가 더 이상 보이지 않아요.</span>
                              <PendingButton className="rounded-lg bg-critical px-3 py-1.5 font-semibold text-white">연결 해제</PendingButton>
                            </form>
                          </details>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <form action="/api/auth/google/start" method="get" className="rounded-2xl border border-dashed border-ink-3/40 p-4 sm:p-5">
                <input type="hidden" name="mode" value="link" />
                <p className="text-[15px] font-semibold text-ink">계정 추가</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                  가져올 정보를 고른 뒤 Google 화면에서 추가할 계정을 선택하세요. 학교 계정은 클래스룸만 골라도 돼요.
                </p>
                <fieldset className="mt-3 flex flex-wrap gap-2">
                  <legend className="sr-only">가져올 정보</legend>
                  {ALL_SERVICES.map((s) => (
                    <label key={s} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[14px] ring-1 ring-line has-[:checked]:ring-ink">
                      <input type="checkbox" name="services" value={s} defaultChecked className="size-4 accent-[var(--ink)]" />
                      {SERVICE_LABELS[s]}
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper hover:opacity-90">
                  Google 계정 추가
                </button>
              </form>
            </>
          )}
        </Block>

        <Block id="agent" title="맥 에이전트" lead="맥에서 2분마다 Claude Code와 Codex 사용 기록, 남은 한도, 맥 알림을 모아 이 대시보드로 보내요. 로그인 정보는 맥 밖으로 나가지 않고, 계산된 숫자만 보내요.">
          {reports.length > 0 ? (
            <ul className="divide-y divide-line rounded-2xl bg-surface">
              {reports.map((r) => (
                <li key={reportKey(r)} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-[14px]">
                  <p className="font-semibold text-ink">{r.host}</p>
                  <p className="text-ink-3">{formatRelative(new Date(r.collectedAt), now)} 보고</p>
                  <p className="text-ink-3">
                    Claude {r.claude?.available ? "연결됨" : "없음"}, Codex {r.codex?.available ? "연결됨" : "없음"}
                  </p>
                  <form action={removeHostAction} className="ml-auto">
                    <input type="hidden" name="host" value={reportKey(r)} />
                    <PendingButton className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-3 hover:bg-surface-2">기록 지우기</PendingButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">아직 보고한 맥이 없어요.</p>
          )}
          <ol className="list-decimal space-y-3 pl-5 text-[14px] leading-relaxed text-ink-2 marker:text-ink-3">
            <li>
              프로젝트 폴더에서 <Code>cp agent/.env.example agent/.env</Code> 를 실행하고, <Code>DASHBOARD_URL</Code>에 아래 주소를,{" "}
              <Code>INGEST_TOKEN</Code>에 아래 토큰을 넣으세요.
              <div className="mt-2 space-y-2">
                <Field label="DASHBOARD_URL" value={origin} />
                {env.ingestToken ? (
                  <SecretField value={env.ingestToken} label="INGEST_TOKEN" />
                ) : (
                  <p className="text-warning-ink">서버에 INGEST_TOKEN이 아직 없어요. 환경 변수에 먼저 추가하세요.</p>
                )}
              </div>
            </li>
            <li>
              <Code>npm run agent:dry</Code> 로 무엇이 수집되는지 확인하세요. 아무것도 보내지 않아요.
            </li>
            <li>
              <Code>npm run agent</Code> 로 한 번 보내 보세요. 이 화면을 새로고침하면 위 목록에 맥이 나타나요.
            </li>
            <li>
              <Code>bash agent/install-launchd.sh</Code> 를 실행하면 로그인할 때마다 켜지고 2분마다 자동으로 보내요. 끄려면{" "}
              <Code>bash agent/uninstall-launchd.sh</Code>.
            </li>
          </ol>
          <p className="text-[13px] leading-relaxed text-ink-3">
            맥 알림을 못 읽는다고 나오면 시스템 설정의 개인정보 보호 및 보안에서 ‘전체 디스크 접근 권한’에 에이전트를 실행하는 node를 추가하세요.
            iPhone 미러링을 켜 두면 iPhone 알림도 맥 알림 센터를 거쳐 함께 수집돼요.
          </p>
        </Block>

        <Block id="phone" title="휴대폰 알림 연결" lead="휴대폰 자동화 앱이 아래 주소로 알림을 보내면, 규칙에 맞는 중요한 알림만 골라 기록해요. 인증번호와 광고는 저장하지 않아요.">
          <div className="space-y-2">
            <Field label="보낼 주소 (POST)" value={ingestUrl} />
            {env.ingestToken && <SecretField value={env.ingestToken} label="토큰" />}
            <p className="text-[13px] text-ink-3">
              요청 헤더에 <Code>Authorization: Bearer 토큰</Code> 을 넣고, 본문은 JSON으로 보내세요.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-2xl bg-surface p-4 text-[13px] leading-relaxed text-ink">{`{
  "source": "iphone",
  "app": "카카오톡",
  "title": "팀플 단톡방",
  "body": "내일 발표 자료 오늘 밤까지 올려 주세요",
  "important": false
}`}</pre>

          <div className="grid gap-4 md:grid-cols-2">
            <Guide title="iPhone (단축어 앱)">
              <li>단축어 앱의 자동화 탭에서 새 개인용 자동화를 만들고 ‘메시지’나 ‘이메일’을 고르세요. 보낸 사람이나 포함된 단어로 범위를 좁힐 수 있어요.</li>
              <li>‘즉시 실행’을 켜세요.</li>
              <li>동작에 ‘URL 콘텐츠 가져오기’를 추가하고 방법을 POST, 헤더에 Authorization을, 본문을 JSON으로 설정해 title, body, app 값을 넣으세요.</li>
              <li>공유 시트용 단축어를 하나 더 만들어 important를 true로 보내면, 아무 앱에서나 ‘이거 기억해’를 바로 보낼 수 있어요.</li>
            </Guide>
            <Guide title="Android (MacroDroid 등)">
              <li>트리거로 ‘알림 수신’을 고르고, 기록할 앱(카카오톡, 문자, 클래스룸 등)을 선택하세요.</li>
              <li>동작으로 ‘HTTP 요청’을 추가하고 방법은 POST, 주소는 위 주소로 하세요.</li>
              <li>헤더에 Authorization을 넣고, 본문을 JSON으로 설정해 알림 제목, 알림 내용, 앱 이름을 title, body, app에 넣으세요.</li>
              <li>source 값은 android로 두면 목록에 휴대폰 아이콘이 붙어요.</li>
            </Guide>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-3">
            연결을 시험하려면 같은 주소로 GET 요청을 보내 보세요. 토큰이 맞으면 ‘연결됐어요’라고 답해요.
          </p>
        </Block>

        <Block id="rules" title="알림 규칙" lead="이 규칙으로 ‘기억할 알림’을 고릅니다. 한 줄에 하나씩, 또는 쉼표로 구분해 적으세요. 앱은 번들 ID(com.apple.ical)나 앱 이름(카카오톡) 일부만 적어도 돼요.">
          <form action={saveRulesAction} className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
            <RuleField name="keywords" label="이 단어가 들어가면 중요" value={rules.keywords} rows={5} />
            <RuleField name="importantApps" label="이 앱의 알림은 항상 중요" value={rules.importantApps} rows={3} />
            <RuleField name="mutedApps" label="이 앱의 알림은 기록하지 않기" value={rules.mutedApps} rows={4} />
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input type="checkbox" name="dropSecurityCodes" defaultChecked={rules.dropSecurityCodes} className="size-4 accent-[var(--ink)]" />
              인증번호가 담긴 알림은 저장하지 않기 (권장)
            </label>
            <div className="flex flex-wrap gap-2">
              <PendingButton className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper hover:opacity-90">규칙 저장</PendingButton>
              <PendingButton formAction={resetRulesAction} className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-ink-2 ring-1 ring-line hover:ring-ink-3">
                기본값으로 되돌리기
              </PendingButton>
            </div>
          </form>
        </Block>

        <Block id="storage" title="저장소" lead="알림, 메모, 연결한 계정 정보, AI 사용량을 저장하는 곳이에요.">
          <p className="text-[14px] leading-relaxed text-ink-2">
            {kv.kind === "redis"
              ? "Upstash Redis에 저장하고 있어요."
              : kv.persistent
                ? "이 컴퓨터의 .data/store.json 파일에 저장하고 있어요. 배포할 때는 Upstash Redis를 연결하세요."
                : "임시 저장소를 쓰고 있어 서버가 다시 시작되면 데이터가 사라져요. Vercel 마켓플레이스에서 Upstash Redis를 연결하세요."}
          </p>
          {!kv.persistent && (
            <Banner tone="error">저장소가 연결되지 않았어요. KV_REST_API_URL과 KV_REST_API_TOKEN 환경 변수를 확인하세요.</Banner>
          )}
        </Block>

        {!session.dev && (
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-ink-2 ring-1 ring-line hover:ring-ink-3">
              로그아웃
            </button>
          </form>
        )}
      </main>
    </>
  );
}

function Block({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-4">
      <div>
        <h2 id={`${id}-title`} className="text-[20px] font-bold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-1.5 max-w-[46em] text-[14px] leading-relaxed text-ink-2">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
        tone === "ok" ? "bg-surface text-ink" : "bg-critical-soft text-ink"
      }`}
    >
      {tone === "ok" ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
      )}
      <span>{children}</span>
    </p>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-surface px-1.5 py-0.5 text-[13px] text-ink">{children}</code>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-2 py-1 pl-3 pr-1">
      <span className="shrink-0 text-[12px] text-ink-3">{label}</span>
      <code className="min-w-0 flex-1 truncate text-[13px] text-ink">{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function Guide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-ink-2 marker:text-ink-3">{children}</ol>
    </div>
  );
}

function RuleField({ name, label, value, rows }: { name: string; label: string; value: string[]; rows: number }) {
  return (
    <div>
      <label htmlFor={`rule-${name}`} className="text-[14px] font-medium text-ink">
        {label}
      </label>
      <textarea
        id={`rule-${name}`}
        name={name}
        rows={rows}
        defaultValue={value.join("\n")}
        className="mt-1.5 w-full rounded-xl bg-surface-2 px-3 py-2.5 text-base leading-relaxed text-ink outline-none focus-visible:ring-2 focus-visible:ring-sky sm:text-[14px]"
      />
    </div>
  );
}

function GoogleSetupGuide({ origin }: { origin: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 text-[14px] leading-relaxed text-ink-2 sm:p-5">
      <p className="font-semibold text-ink">Google 로그인을 먼저 설정하세요</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 marker:text-ink-3">
        <li>Google Cloud 콘솔에서 프로젝트를 만들고 Gmail API, Google Calendar API, Google Classroom API를 사용 설정하세요.</li>
        <li>OAuth 동의 화면을 ‘외부’로 만들고, 연결할 Google 계정 3개를 테스트 사용자로 추가하세요.</li>
        <li>
          사용자 인증 정보에서 ‘웹 애플리케이션’ OAuth 클라이언트를 만들고 승인된 리디렉션 URI에 아래 주소를 넣으세요.
          <div className="mt-2">
            <Field label="리디렉션 URI" value={`${origin}/api/auth/google/callback`} />
          </div>
        </li>
        <li>발급된 클라이언트 ID와 보안 비밀을 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 환경 변수에 넣고 서버를 다시 시작하세요.</li>
      </ol>
      <p className="mt-3 text-[13px] text-ink-3">
        테스트 모드에서는 7일마다 다시 로그인해야 해요. 계속 쓰려면 동의 화면을 ‘프로덕션’으로 게시하세요. 확인되지 않은 앱 경고가 나오지만 본인 계정은 계속 진행할 수 있어요.
      </p>
    </div>
  );
}
