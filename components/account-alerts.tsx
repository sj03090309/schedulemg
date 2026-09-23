import { TriangleAlert } from "lucide-react";
import { getAccounts, getAccountTags } from "@/lib/dashboard-data";
import { needsRegrant, type GoogleAccount } from "@/lib/google/accounts";
import { grantedServices } from "@/lib/google/oauth";

/** Google 연결이 끊겼거나 곧 만료될 계정이 있을 때만 맨 위에 한 줄로 알려 준다. */
export async function AccountAlerts({ demo }: { demo: boolean }) {
  if (demo) return null;
  const [accounts, tags] = await Promise.all([getAccounts(), getAccountTags(false)]);
  const broken = accounts.filter((a) => a.needsReauth);
  const expiring = accounts.filter((a) => needsRegrant(a));
  if (!broken.length && !expiring.length) return null;

  const relink = (a: GoogleAccount) =>
    `/api/auth/google/start?mode=link&hint=${encodeURIComponent(a.email)}&services=${grantedServices(a.scope).join(",")}`;

  return (
    <div role="status" className="mb-4 rounded-2xl bg-warning-soft px-4 py-3 text-[14px] leading-relaxed text-ink">
      <p className="flex items-start gap-2 font-semibold">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
        {broken.length
          ? "Google 계정 연결이 끊겼어요. 다시 연결하면 메일과 일정이 바로 돌아와요."
          : "Google 권한을 한 번만 다시 받아 주세요. 테스트 모드에서 받은 권한은 7일 뒤 만료돼요."}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {[...broken, ...expiring].map((a) => (
          <li key={a.email}>
            <a
              href={relink(a)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-line hover:ring-ink-3"
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--acct-${tags[a.email]?.slot ?? 0})` }} />
              {tags[a.email]?.label ?? a.email} 다시 연결
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
