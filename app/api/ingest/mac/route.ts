import { checkIngestAuth, readJsonBody } from "@/lib/ingest-auth";
import { sanitizeMacData, saveMacData } from "@/lib/mac-data";

// 맥 에이전트가 맥 캘린더 일정과 메모 앱 메모를 보내는 곳
export async function POST(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await readJsonBody(request, 1_000_000);
  } catch {
    return Response.json({ ok: false, error: "JSON 본문을 읽지 못했어요." }, { status: 400 });
  }
  const data = sanitizeMacData(body);
  if (!data) return Response.json({ ok: false, error: "형식이 올바르지 않아요." }, { status: 400 });

  await saveMacData(data);
  return Response.json({
    ok: true,
    events: data.calendar?.events.length ?? 0,
    notes: data.notes?.items.length ?? 0,
  });
}
