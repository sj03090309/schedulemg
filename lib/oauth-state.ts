// Google 로그인 왕복 동안 state 값과 목적(로그인/계정 추가)을 담아 두는 쿠키
export const OAUTH_STATE_COOKIE = "smg_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";

export interface OAuthState {
  state: string;
  mode: "login" | "link";
}

export function encodeState(value: OAuthState): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<OAuthState>;
    if (typeof value.state === "string" && (value.mode === "login" || value.mode === "link")) {
      return { state: value.state, mode: value.mode };
    }
  } catch {
    // 잘못된 쿠키는 무시한다.
  }
  return null;
}
