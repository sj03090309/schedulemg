import { NextResponse, type NextRequest } from "next/server";
import { isDevBypass } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_RENEW_AFTER,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/session-token";

// 로그인하지 않았으면 /login으로 보낸다. 서버 액션과 라우트도 각자 한 번 더 세션을 확인한다.
export async function proxy(request: NextRequest) {
  if (isDevBypass()) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = NextResponse.next();
    // 자주 여는 동안에는 로그인이 풀리지 않도록 하루에 한 번 세션을 새로 발급한다.
    if (Date.now() / 1000 - session.issuedAt > SESSION_RENEW_AFTER) {
      res.cookies.set(SESSION_COOKIE, await signSession(session.email), sessionCookieOptions(request.nextUrl.protocol === "https:"));
    }
    return res;
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|privacy|api/auth|api/ingest|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt).*)",
  ],
};
