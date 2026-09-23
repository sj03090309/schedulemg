import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { isGoogleConfigured } from "@/lib/env";
import { buildAuthUrl, parseServices, redirectUriFor } from "@/lib/google/oauth";
import { OAUTH_COOKIE_PATH, OAUTH_STATE_COOKIE, encodeState } from "@/lib/oauth-state";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// mode=login: 대시보드 로그인 / mode=link: 로그인한 상태에서 Google 계정 추가·재연결
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=not_configured", request.url));
  }
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") === "link" ? "link" : "login";
  if (mode === "link" && !(await verifySession(request.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.redirect(new URL("/login?error=session", request.url));
  }

  const state = randomToken(18);
  const response = NextResponse.redirect(
    buildAuthUrl({
      redirectUri: redirectUriFor(request.url),
      state,
      services: parseServices(params.getAll("services").join(",")),
      loginHint: params.get("hint") ?? undefined,
    }),
  );
  response.cookies.set(OAUTH_STATE_COOKIE, encodeState({ state, mode }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return response;
}
