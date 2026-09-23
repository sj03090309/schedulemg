import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDevBypass } from "./env";
import { SESSION_COOKIE, verifySession } from "./session-token";

export interface Session {
  email: string;
  /** Google OAuth 설정 전 로컬 개발 모드 */
  dev: boolean;
}

export async function getSession(): Promise<Session | null> {
  if (isDevBypass()) return { email: "local", dev: true };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  return session ? { email: session.email, dev: false } : null;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
