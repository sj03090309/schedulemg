import { env } from "../env";

export type GoogleService = "gmail" | "calendar" | "classroom";

export const ALL_SERVICES: GoogleService[] = ["gmail", "calendar", "classroom"];

export const SERVICE_LABELS: Record<GoogleService, string> = {
  gmail: "Gmail",
  calendar: "캘린더",
  classroom: "클래스룸",
};

const CLASSROOM_ANNOUNCEMENTS = "https://www.googleapis.com/auth/classroom.announcements.readonly";

// 서비스가 동작하는 데 꼭 필요한 권한
const REQUIRED_SCOPES: Record<GoogleService, string[]> = {
  gmail: ["https://www.googleapis.com/auth/gmail.readonly"],
  calendar: ["https://www.googleapis.com/auth/calendar.readonly"],
  classroom: [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  ],
};

// 있으면 더 보여 줄 수 있는 권한
const OPTIONAL_SCOPES: Partial<Record<GoogleService, string[]>> = {
  classroom: [CLASSROOM_ANNOUNCEMENTS],
};

export function scopesFor(services: GoogleService[]): string[] {
  return [
    "openid",
    "email",
    "profile",
    ...services.flatMap((s) => [...REQUIRED_SCOPES[s], ...(OPTIONAL_SCOPES[s] ?? [])]),
  ];
}

export function grantedServices(scope: string): GoogleService[] {
  const granted = new Set(scope.split(/\s+/));
  return ALL_SERVICES.filter((s) => REQUIRED_SCOPES[s].every((sc) => granted.has(sc)));
}

export function hasAnnouncementScope(scope: string): boolean {
  return scope.split(/\s+/).includes(CLASSROOM_ANNOUNCEMENTS);
}

export function parseServices(value: string | null | undefined): GoogleService[] {
  const picked = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is GoogleService => (ALL_SERVICES as string[]).includes(s));
  return picked.length ? picked : ALL_SERVICES;
}

export function redirectUriFor(requestUrl: string): string {
  const origin = env.appUrl || new URL(requestUrl).origin;
  return `${origin}/api/auth/google/callback`;
}

export function buildAuthUrl(opts: {
  redirectUri: string;
  state: string;
  services: GoogleService[];
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: scopesFor(opts.services).join(" "),
    // refresh token을 매번 확실히 받기 위해 동의 화면을 띄운다.
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    description?: string,
  ) {
    super(description ? `${code}: ${description}` : code);
  }
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new OAuthError(json.error ?? `http_${res.status}`, json.error_description);
  }
  return json as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export interface GoogleUser {
  email: string;
  name?: string;
  picture?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUser> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new OAuthError(`userinfo_${res.status}`);
  const json = (await res.json()) as GoogleUser & { email_verified?: boolean };
  if (!json.email) throw new OAuthError("no_email");
  return { email: json.email.toLowerCase(), name: json.name, picture: json.picture };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
