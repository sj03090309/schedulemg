import { listAccounts } from "@/lib/google/accounts";
import { countClassroomCalendars } from "@/lib/google/calendar";
import { grantedServices } from "@/lib/google/oauth";
import { checkIngestAuth, readJsonBody } from "@/lib/ingest-auth";
import { getKV } from "@/lib/store/kv";
import { loadUsageReports, saveUsageReport } from "@/lib/usage/store";
import { sanitizeReport } from "@/lib/usage/validate";

// 연결 점검용: 저장소 종류와 마지막으로 받은 보고 시각만 알려 준다 (로그인 없이 토큰으로 확인).
export async function GET(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;
  const kv = getKV();
  const [reports, accounts] = await Promise.all([loadUsageReports(), listAccounts().catch(() => [])]);
  // 캘린더 권한이 있는 계정은 클래스룸 수업 캘린더가 몇 개 보이는지도 알려 준다.
  const classroomCalendars = await Promise.all(
    accounts.map((a) =>
      grantedServices(a.scope).includes("calendar") && !a.needsReauth
        ? countClassroomCalendars(a).catch(() => null)
        : Promise.resolve(null),
    ),
  );
  return Response.json({
    ok: true,
    storage: kv.kind,
    persistent: kv.persistent,
    hosts: reports.map((r) => ({ host: r.host, collectedAt: r.collectedAt, receivedAt: r.receivedAt })),
    // 이메일은 앞 세 글자만 보여 준다.
    google: accounts.map((a, i) => ({
      account: a.email.replace(/^(.{3})[^@]*/, "$1…"),
      services: grantedServices(a.scope),
      needsReauth: Boolean(a.needsReauth),
      classroomCalendars: classroomCalendars[i],
    })),
  });
}

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
