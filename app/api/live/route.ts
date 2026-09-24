import { getVersion } from "@/lib/live";

// 대시보드가 15초마다 묻는 곳: 새 데이터가 들어왔는지(버전)만 알려 준다. 로그인은 proxy가 확인한다.
export async function GET() {
  try {
    return Response.json({ v: await getVersion() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ v: null }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
