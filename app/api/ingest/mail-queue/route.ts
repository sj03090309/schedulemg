import { cached, mapLimit } from "@/lib/concurrency";
import { isGoogleConfigured } from "@/lib/env";
import { listAccounts } from "@/lib/google/accounts";
import { fetchMail, fetchMessageText } from "@/lib/google/gmail";
import { grantedServices } from "@/lib/google/oauth";
import { checkIngestAuth } from "@/lib/ingest-auth";
import { insightKey, isCurrentInsight, loadInsights } from "@/lib/mail-insights";
import { DAY } from "@/lib/time";

const MAX_ITEMS = 15;

// 맥 에이전트가 가져가 Claude로 요약할 메일 목록: 최근 2일 받은편지함 중 아직 판단하지 않은 것.
export async function GET(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;
  if (!isGoogleConfigured()) return Response.json({ ok: true, items: [] });

  const [accounts, insights] = await Promise.all([listAccounts(), loadInsights()]);
  const now = Date.now();
  const items: { key: string; from: string; fromAddress: string; subject: string; date: string; unread: boolean; body: string }[] = [];

  for (const account of accounts.filter((a) => !a.needsReauth && grantedServices(a.scope).includes("gmail"))) {
    try {
      // 대시보드와 같은 캐시 키를 써서 Gmail 호출을 나눠 쓴다.
      const box = await cached(`g:${account.email}:mail`, 60_000, () => fetchMail(account));
      const todo = box.items
        .filter((m) => !isCurrentInsight(insights[insightKey(account.email, m.id)]) && now - Date.parse(m.date) < 2 * DAY)
        .slice(0, MAX_ITEMS);
      const withBody = await mapLimit(todo, 4, async (m) => ({
        key: insightKey(account.email, m.id),
        from: m.from,
        fromAddress: m.fromAddress,
        subject: m.subject,
        date: m.date,
        unread: m.unread,
        body: await fetchMessageText(account, m.id).catch(() => m.snippet),
      }));
      items.push(...withBody);
    } catch (e) {
      console.error("[mail-queue]", account.email, e);
    }
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return Response.json({ ok: true, now: new Date(now).toISOString(), items: items.slice(0, MAX_ITEMS) });
}
