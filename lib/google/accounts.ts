import { decrypt, encrypt } from "../crypto";
import { getKV, hgetallJSON, hsetJSON } from "../store/kv";
import { OAuthError, refreshAccessToken } from "./oauth";

const KEY = "google:accounts";

export interface GoogleAccount {
  email: string;
  /** 화면에 보일 별명 (예: 개인, 학교). 없으면 이메일 앞부분 */
  label?: string;
  name?: string;
  picture?: string;
  refreshToken: string;
  scope: string;
  addedAt: string;
  /** 지금 refresh token을 받은 시각 */
  tokenIssuedAt?: string;
  needsReauth?: boolean;
  lastError?: string;
}

// Google 앱을 '프로덕션'으로 게시한 시각. 그 전(테스트 모드)에 받은 refresh token은 7일 뒤 만료되므로 한 번 다시 받아야 한다.
const PUBLISHED_AT = "2026-09-23T15:50:00.000Z";

export function needsRegrant(account: Pick<GoogleAccount, "tokenIssuedAt" | "needsReauth">): boolean {
  return !account.needsReauth && (!account.tokenIssuedAt || account.tokenIssuedAt < PUBLISHED_AT);
}

/** 여러 계정의 항목을 한 목록에 섞어 보여 줄 때 쓰는 표시 정보. slot은 계정 색 순서(0부터). */
export interface AccountTag {
  email: string;
  label: string;
  slot: number;
}

export function defaultAccountLabel(email: string): string {
  return email.split("@")[0] ?? email;
}

export function accountTags(accounts: Pick<GoogleAccount, "email" | "label">[]): Record<string, AccountTag> {
  const tags: Record<string, AccountTag> = {};
  accounts.forEach((a, i) => {
    tags[a.email] = { email: a.email, label: a.label?.trim() || defaultAccountLabel(a.email), slot: i % 3 };
  });
  return tags;
}

type StoredAccount = Omit<GoogleAccount, "refreshToken"> & { refreshTokenEnc: string };

export class AccountAuthError extends Error {
  constructor(
    readonly email: string,
    message: string,
  ) {
    super(message);
  }
}

export async function listAccounts(): Promise<GoogleAccount[]> {
  const stored = await hgetallJSON<StoredAccount>(KEY);
  const accounts = Object.values(stored).map(({ refreshTokenEnc, ...rest }): GoogleAccount => {
    try {
      return { ...rest, refreshToken: decrypt(refreshTokenEnc) };
    } catch {
      return {
        ...rest,
        refreshToken: "",
        needsReauth: true,
        lastError: "저장된 토큰을 읽지 못했어요. SESSION_SECRET이 바뀌었다면 다시 연결하세요.",
      };
    }
  });
  return accounts.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function saveAccount(account: GoogleAccount): Promise<void> {
  const { refreshToken, ...rest } = account;
  const stored: StoredAccount = { ...rest, refreshTokenEnc: encrypt(refreshToken) };
  await hsetJSON(KEY, account.email, stored);
}

export async function removeAccount(email: string): Promise<void> {
  await getKV().hdel(KEY, email);
  tokenCache.delete(email);
}

export async function renameAccount(email: string, label: string): Promise<void> {
  const stored = (await hgetallJSON<StoredAccount>(KEY))[email];
  if (!stored) return;
  await hsetJSON(KEY, email, { ...stored, label: label.trim().slice(0, 20) || undefined });
}

async function markNeedsReauth(email: string, message: string): Promise<void> {
  const stored = (await hgetallJSON<StoredAccount>(KEY))[email];
  if (!stored) return;
  await hsetJSON(KEY, email, { ...stored, needsReauth: true, lastError: message });
}

// access token은 1시간짜리라 저장하지 않고 인스턴스 메모리에만 둔다.
type CachedToken = { token: string; exp: number };
const g = globalThis as unknown as { __smgTokens?: Map<string, CachedToken> };
const tokenCache = (g.__smgTokens ??= new Map<string, CachedToken>());

export function rememberAccessToken(email: string, token: string, expiresIn: number): void {
  tokenCache.set(email, { token, exp: Date.now() + expiresIn * 1000 });
}

export function forgetAccessToken(email: string): void {
  tokenCache.delete(email);
}

export async function getAccessToken(account: GoogleAccount, force = false): Promise<string> {
  const hit = tokenCache.get(account.email);
  if (!force && hit && hit.exp - 60_000 > Date.now()) return hit.token;
  if (!account.refreshToken || account.needsReauth) {
    throw new AccountAuthError(
      account.email,
      account.lastError ?? `${account.email} 계정을 다시 연결해야 해요.`,
    );
  }
  try {
    const t = await refreshAccessToken(account.refreshToken);
    rememberAccessToken(account.email, t.access_token, t.expires_in);
    return t.access_token;
  } catch (e) {
    if (e instanceof OAuthError && e.code === "invalid_grant") {
      const message = `${account.email} 연결이 만료됐어요. 설정에서 다시 연결하세요.`;
      await markNeedsReauth(account.email, message);
      throw new AccountAuthError(account.email, message);
    }
    throw e;
  }
}
