type Row = Record<string, unknown>;

export type BotSnapshot = {
  bots: Row[];
  performances: Row[];
  trades: Row[];
  accounts: Row[];
  quotes: Row[];
};

export type HmrcTradeRow = {
  MONTH_ID?: string;
  FLOW_TYPE_ID?: string;
  FLOW_DESCRIPTION?: string;
  HS2CODE?: string;
  HS4CODE?: string;
  HS6CODE?: string;
  TRADE_VALUE?: number;
  NET_MASS?: number;
};

const BOT_SNAPSHOT_TTL_MS = 15_000;
const botSnapshotCache = new Map<string, { data: BotSnapshot; expiresAt: number }>();
const botSnapshotRequests = new Map<string, Promise<BotSnapshot>>();
const REPORT_SNAPSHOT_TTL_MS = 5 * 60_000;
let reportSnapshotCache: { data: Row[]; expiresAt: number } | null = null;
let reportSnapshotRequest: Promise<Row[]> | null = null;

export class SnowflakeApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SnowflakeApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const rawBody = await response.text();
  let payload = {} as { error?: string; code?: string } & T;
  try {
    payload = rawBody ? JSON.parse(rawBody) as typeof payload : payload;
  } catch {
    // Vercel 함수 초기화 실패처럼 JSON이 아닌 응답은 아래에서 상태 코드와 함께 표시합니다.
  }
  if (!response.ok) {
    const vercelError = response.headers.get('x-vercel-error');
    const fallback = vercelError
      ? `Vercel 함수 실행에 실패했습니다. (${response.status}, ${vercelError})`
      : rawBody.trim() || `Snowflake 요청에 실패했습니다. (HTTP ${response.status})`;
    throw new SnowflakeApiError(payload.error || fallback, response.status, payload.code || vercelError || undefined);
  }
  return payload;
}

export async function readSnowflakeTable(name: string): Promise<Row[]> {
  const result = await request<{ data: Row[] }>(`/api/data?table=${encodeURIComponent(name)}`);
  return result.data ?? [];
}

export function readSnowflakeBotSnapshot(scenario: boolean): Promise<BotSnapshot> {
  const key = scenario ? 'scenario' : 'live';
  const cached = botSnapshotCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);

  const pending = botSnapshotRequests.get(key);
  if (pending) return pending;

  const next = request<{ data: BotSnapshot }>(`/api/data?view=bots&scenario=${scenario ? '1' : '0'}`)
    .then((result) => {
      botSnapshotCache.set(key, { data: result.data, expiresAt: Date.now() + BOT_SNAPSHOT_TTL_MS });
      return result.data;
    })
    .finally(() => botSnapshotRequests.delete(key));
  botSnapshotRequests.set(key, next);
  return next;
}

export function readSnowflakeReportSnapshot(): Promise<Row[]> {
  if (reportSnapshotCache && reportSnapshotCache.expiresAt > Date.now()) {
    return Promise.resolve(reportSnapshotCache.data);
  }
  if (reportSnapshotRequest) return reportSnapshotRequest;

  reportSnapshotRequest = request<{ data: Row[] }>('/api/data?view=reports')
    .then((result) => {
      const data = result.data ?? [];
      reportSnapshotCache = { data, expiresAt: Date.now() + REPORT_SNAPSHOT_TTL_MS };
      return data;
    })
    .finally(() => { reportSnapshotRequest = null; });
  return reportSnapshotRequest;
}

export async function readHmrcTradeSnapshot(): Promise<HmrcTradeRow[]> {
  const result = await request<{ data: HmrcTradeRow[] }>('/api/data?view=hmrc-trade');
  return result.data ?? [];
}

export async function mutateSnowflake(action: string, data: Row = {}) {
  return request<{ id?: number; ok?: boolean }>('/api/data', {
    method: 'POST',
    body: JSON.stringify({ action, data }),
  });
}

// Snowflake 자격 증명은 서버에만 존재하므로 브라우저는 항상 API 연결을 시도합니다.
export const snowflakeConfigured = true;
