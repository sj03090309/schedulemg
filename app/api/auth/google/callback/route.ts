import { NextResponse, type NextRequest } from "next/server";
import { clearCached } from "@/lib/concurrency";
import { env } from "@/lib/env";
import { listAccounts, rememberAccessToken, saveAccount } from "@/lib/google/accounts";
import { exchangeCode, fetchUserInfo, redirectUriFor } from "@/lib/google/oauth";
import { OAUTH_COOKIE_PATH, OAUTH_STATE_COOKIE, decodeState } from "@/lib/oauth-state";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "@/lib/session-token";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = decodeState(request.cookies.get(OAUTH_STATE_COOKIE)?.value);
  const back = saved?.mode === "link" ? "/settings" : "/login";
  const secure = request.nextUrl.protocol === "https:";

  const finish = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.set(OAUTH_STATE_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };
  const fail = (code: string) => finish(`${back}?error=${code}`);

  const error = params.get("error");
  if (error) return fail(error === "access_denied" ? "denied" : "oauth");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !saved || saved.state !== state) return fail("state");

  try {
    const tokens = await exchangeCode(code, redirectUriFor(request.url));
    const user = await fetchUserInfo(tokens.access_token);
    const existing = (await listAccounts()).find((a) => a.email === user.email);

    if (saved.mode === "login") {
      // 허용 목록에 있거나, 이미 연결해 둔 계정만 로그인할 수 있다.
      if (!env.allowedEmails.includes(user.email) && !existing) return fail("not_allowed");
    } else if (!(await verifySession(request.cookies.get(SESSION_COOKIE)?.value))) {
      return fail("session");
    }

    const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) return fail("no_refresh");

    await saveAccount({
      email: user.email,
      label: existing?.label,
      name: user.name,
      picture: user.picture,
      refreshToken,
      scope: tokens.scope,
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    });
    rememberAccessToken(user.email, tokens.access_token, tokens.expires_in);
    clearCached(`g:${user.email}:`);

    const res = finish(saved.mode === "link" ? "/settings?linked=1#google" : "/");
    if (saved.mode === "login") {
      res.cookies.set(SESSION_COOKIE, await signSession(user.email), sessionCookieOptions(secure));
    }
    return res;
  } catch (e) {
    console.error("[oauth callback]", e);
    return fail("oauth");
  }
}
