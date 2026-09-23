import { SignJWT, jwtVerify } from "jose";

// proxy.ts에서도 쓰므로 next/headers 같은 요청 API에 의존하지 않는다.
export const SESSION_COOKIE = "smg_session";
/** 90일 동안 한 번도 열지 않으면 다시 로그인한다. 쓰는 동안에는 proxy가 계속 연장한다. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90;
/** 발급된 지 이보다 오래된 세션은 요청 때 새로 발급한다 */
export const SESSION_RENEW_AFTER = 60 * 60 * 24;

function secretKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
}

export async function signSession(email: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("SESSION_SECRET(16자 이상)을 설정하세요.");
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key);
}

export async function verifySession(token: string | undefined): Promise<{ email: string; issuedAt: number } | null> {
  const key = secretKey();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return typeof payload.email === "string" ? { email: payload.email, issuedAt: payload.iat ?? 0 } : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE };
}
