export type Provider = "claude" | "codex";

/** 맥 에이전트가 보내는 날짜·모델별 토큰 합계 (날짜는 KST) */
export interface UsageRow {
  date: string;
  /** claude-opus-5, claude-opus-5:fast, gpt-5.6-sol … */
  model: string;
  /** 캐시되지 않은 입력 */
  input: number;
  /** 출력 (추론 토큰 포함) */
  output: number;
  cacheRead: number;
  /** 캐시 쓰기 (Claude는 5분 캐시) */
  cacheWrite: number;
  /** Claude 1시간 캐시 쓰기 */
  cacheWrite1h?: number;
  /** 출력 중 추론 토큰 (표시용) */
  reasoning?: number;
  requests: number;
  webSearches?: number;
}

export type RecentRow = Omit<UsageRow, "date">;

export interface LimitWindow {
  id: string;
  label: string;
  usedPercent: number;
  windowMinutes?: number | null;
  resetsAt?: string | null;
}

export interface ProviderLimits {
  /** 어디서 읽었는지 (계정 사용량 API, 세션 로그 …) */
  source: string;
  fetchedAt: string;
  plan?: string | null;
  windows: LimitWindow[];
}

export interface ProviderSnapshot {
  available: boolean;
  error?: string | null;
  days: UsageRow[];
  /** 최근 5시간 모델별 합계 */
  last5h?: RecentRow[];
  latestModel?: string | null;
  limits?: ProviderLimits | null;
  limitsError?: string | null;
}

export interface UsageReport {
  /** 화면에 보일 맥 이름 */
  host: string;
  /** 맥마다 고정된 ID. 이름이 바뀌어도 같은 맥의 보고를 덮어쓴다. */
  hostId?: string;
  collectedAt: string;
  agentVersion?: string;
  claude?: ProviderSnapshot | null;
  codex?: ProviderSnapshot | null;
  /** 맥 알림 수집 상태 (못 읽으면 이유) */
  macNotifications?: { available: boolean; error?: string | null } | null;
}

export interface StoredUsageReport extends UsageReport {
  receivedAt: string;
}
