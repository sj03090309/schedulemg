import { checkIngestAuth } from "@/lib/ingest-auth";
import { bumpVersion } from "@/lib/live";
import { ingestNotifications, normalizeIncoming, type IncomingNotification } from "@/lib/notifications";

// 휴대폰 단축어·자동화 앱이 연결을 시험할 때 쓴다.
export async function GET(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;
  return Response.json({ ok: true, message: "연결됐어요. 같은 주소로 POST하면 알림이 기록돼요." });
}

// 맥 에이전트, iPhone 단축어, Android 자동화 앱이 알림을 보내는 곳.
// 한 건({ title, body, ... }), 배열, 또는 { notifications: [...] } 형태를 모두 받는다.
export async function POST(request: Request) {
  const denied = checkIngestAuth(request);
  if (denied) return denied;

  let body: unknown;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("form")) {
      body = Object.fromEntries((await request.formData()).entries());
    } else {
      const text = await request.text();
      if (text.length > 1_000_000) throw new Error("too large");
      body = JSON.parse(text);
    }
  } catch {
    return Response.json({ ok: false, error: "본문을 읽지 못했어요. JSON으로 보내 주세요." }, { status: 400 });
  }

  const list: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { notifications?: unknown }).notifications)
      ? (body as { notifications: unknown[] }).notifications
      : [body];
  const incoming = list
    .slice(0, 500)
    .map(normalizeIncoming)
    .filter((n): n is IncomingNotification => n !== null);
  if (!incoming.length) {
    return Response.json({ ok: false, error: "title이나 body가 있는 알림이 없어요." }, { status: 400 });
  }

  const result = await ingestNotifications(incoming);
  if (result.stored > 0) await bumpVersion();
  return Response.json({ ok: true, ...result });
}
