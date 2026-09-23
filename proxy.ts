import { NextResponse, type NextRequest } from "next/server";
import { isDevBypass } from "@/lib/env";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// 로그인하지 않았으면 /login으로 보낸다. 서버 액션과 라우트도 각자 한 번 더 세션을 확인한다.
export async function proxy(request: NextRequest) {
  if (isDevBypass()) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/ingest|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt).*)",
  ],
};
