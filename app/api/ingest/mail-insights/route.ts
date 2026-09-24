import { checkIngestAuth, readJsonBody } from "@/lib/ingest-auth";
import { bumpVersion } from "@/lib/live";
import { INSIGHT_VERSION, parseDue, saveInsights, type MailInsight } from "@/lib/mail-insights";
import { clampText } from "@/lib/text";

// 맥 에이전트가 Claude로 만든 메일 중요도·요약을 저장한다.
export async function POST(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await readJsonBody(request, 500_000);
  } catch {
    return Response.json({ ok: false, error: "JSON 본문을 읽지 못했어요." }, { status: 400 });
  }
  const list = body && typeof body === "object" ? (body as { insights?: unknown }).insights : null;
  if (!Array.isArray(list)) return Response.json({ ok: false, error: "insights 배열이 필요해요." }, { status: 400 });

  const at = new Date().toISOString();
  const entries: Record<string, MailInsight> = {};
  for (const raw of list.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.slice(0, 300) : "";
    if (!key.includes(":")) continue;
    entries[key] = {
      important: r.important === true,
      summary: typeof r.summary === "string" ? clampText(r.summary, 200) : "",
      action: typeof r.action === "string" && r.action.trim() ? clampText(r.action, 80) : null,
      due: parseDue(r.due),
      skipped: r.skipped === true || undefined,
      v: INSIGHT_VERSION,
      at,
    };
  }
  await saveInsights(entries);
  if (Object.keys(entries).length) await bumpVersion();
  return Response.json({ ok: true, saved: Object.keys(entries).length });
}
