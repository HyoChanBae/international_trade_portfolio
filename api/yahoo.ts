const ranges = new Set(['1d', '5d', '1mo', '3mo', '1y']);

type LegacyRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type LegacyResponse = {
  status(code: number): LegacyResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

const normaliseSymbol = (input: string) => {
  const value = input.trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(value)) throw new Error('올바른 종목코드를 입력해 주세요.');
  return /^\d{6}$/.test(value) ? `${value}.KS` : value;
};

async function fetchHandler(request: Request) {
  try {
    if (request.method !== 'POST') return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
    const body = await request.json() as { symbol?: string; range?: string };
    const symbol = normaliseSymbol(body.symbol || '');
    const range = ranges.has(body.range || '') ? body.range! : '1mo';
    const interval = range === '1d' ? '5m' : range === '5d' ? '30m' : '1d';
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 Luka/1.0', Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Yahoo Finance 응답 오류 (${response.status})`);
    const payload = await response.json() as any;
    const result = payload?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const points = (result?.timestamp ?? []).map((time: number, index: number) => ({
      time, open: quote?.open?.[index], high: quote?.high?.[index], low: quote?.low?.[index],
      close: quote?.close?.[index], volume: quote?.volume?.[index],
    })).filter((point: any) => [point.open, point.high, point.low, point.close].every(Number.isFinite));
    return Response.json({
      symbol: body.symbol, yahooSymbol: symbol, currency: result?.meta?.currency || '',
      exchangeName: result?.meta?.exchangeName || '', instrumentType: result?.meta?.instrumentType || '',
      currentPrice: result?.meta?.regularMarketPrice ?? points.at(-1)?.close ?? 0,
      previousClose: result?.meta?.chartPreviousClose ?? result?.meta?.previousClose ?? 0,
      regularMarketTime: result?.meta?.regularMarketTime ?? null, points,
    }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '시세를 불러오지 못했습니다.';
    return Response.json({ error: message }, { status: 400 });
  }
}

export default async function handler(request: LegacyRequest, response: LegacyResponse) {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (value != null) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  });
  const method = request.method || 'GET';
  const origin = `https://${headers.get('host') || 'localhost'}`;
  const url = new URL(request.url || '/api/yahoo', origin);
  const body = method === 'GET' || method === 'HEAD' || request.body == null
    ? undefined
    : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const result = await fetchHandler(new Request(url, { method, headers, body }));
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.status(result.status).send(await result.text());
}
