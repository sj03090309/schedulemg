import { safeEqual } from "./crypto";
import { env } from "./env";

/** 맥 에이전트와 휴대폰 자동화가 쓰는 Bearer 토큰 확인. 통과하면 null. */
export function checkIngestAuth(request: Request): Response | null {
  if (!env.ingestToken) {
    return Response.json({ ok: false, error: "서버에 INGEST_TOKEN이 설정되지 않았어요." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = (header.toLowerCase().startsWith("bearer ") ? header.slice(7) : request.headers.get("x-ingest-token") ?? "").trim();
  if (!token || !safeEqual(token, env.ingestToken)) {
    return Response.json({ ok: false, error: "토큰이 올바르지 않아요." }, { status: 401 });
  }
  return null;
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new Error("본문이 너무 커요.");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("본문이 너무 커요.");
  return JSON.parse(text);
}
