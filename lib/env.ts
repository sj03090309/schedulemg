// 서버에서만 읽는 환경 변수. 값이 비어 있으면 해당 기능은 "설정 필요" 상태로 표시한다.

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  ingestToken: process.env.INGEST_TOKEN ?? "",
  allowedEmails: list(process.env.ALLOWED_EMAILS),
  appUrl: (process.env.APP_URL ?? "").replace(/\/$/, ""),
  redisUrl: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "",
  redisToken: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  usdKrwFallback: Number(process.env.USD_KRW_FALLBACK ?? "") || 1400,
};

export function isGoogleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

/** 개발 서버에서 Google OAuth를 아직 설정하지 않았을 때만 로그인 없이 화면을 볼 수 있다. */
export function isDevBypass(): boolean {
  return process.env.NODE_ENV === "development" && !isGoogleConfigured();
}
