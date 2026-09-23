import { checkIngestAuth, readJsonBody } from "@/lib/ingest-auth";
import { saveUsageReport } from "@/lib/usage/store";
import { sanitizeReport } from "@/lib/usage/validate";

// 맥 에이전트가 Claude Code / Codex 사용량을 보내는 곳
export async function POST(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await readJsonBody(request, 3_000_000);
  } catch {
    return Response.json({ ok: false, error: "JSON 본문을 읽지 못했어요." }, { status: 400 });
  }
  const report = sanitizeReport(body);
  if (!report) return Response.json({ ok: false, error: "보고 형식이 올바르지 않아요." }, { status: 400 });

  await saveUsageReport(report);
  return Response.json({ ok: true, host: report.host });
}
