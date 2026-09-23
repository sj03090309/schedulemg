import { AccountAuthError, forgetAccessToken, getAccessToken, type GoogleAccount } from "./accounts";

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Google REST API GET. 401이면 토큰을 새로 받아 한 번 더 시도한다. */
export async function gget<T>(account: GoogleAccount, url: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(account, attempt > 0);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 && attempt === 0) {
      forgetAccessToken(account.email);
      continue;
    }
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string; status?: string } };
        message = body.error?.message ?? body.error?.status ?? message;
      } catch {
        // 본문이 JSON이 아니면 상태 코드만 남긴다.
      }
      throw new GoogleApiError(res.status, message);
    }
    return (await res.json()) as T;
  }
  throw new GoogleApiError(401, "인증에 실패했어요.");
}

/** 화면에 보여 줄 한국어 오류 문장 */
export function describeGoogleError(error: unknown, service: string): string {
  if (error instanceof AccountAuthError) return error.message;
  if (error instanceof GoogleApiError) {
    const m = error.message;
    if (error.status === 403) {
      if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m)) {
        return `Google Cloud 프로젝트에서 ${service} API가 꺼져 있어요. API 라이브러리에서 사용 설정하세요.`;
      }
      if (/insufficient|scope|permission/i.test(m)) {
        return `${service} 권한이 없어요. 설정에서 이 계정을 다시 연결하세요.`;
      }
      return `${service} 접근이 거부됐어요. (${m})`;
    }
    if (error.status === 429) return `${service} 요청이 너무 많아요. 잠시 뒤 다시 불러올게요.`;
    return `${service} 요청이 실패했어요. (${error.status})`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return `${service} 응답이 늦어요. 잠시 뒤 다시 불러올게요.`;
  }
  return `${service} 정보를 불러오지 못했어요.`;
}
