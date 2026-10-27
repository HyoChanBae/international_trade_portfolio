export type YahooChartRange = '1d' | '5d' | '1mo' | '3mo' | '1y';

export type YahooCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type YahooChartData = {
  symbol: string;
  yahooSymbol: string;
  currency: string;
  exchangeName: string;
  instrumentType: string;
  currentPrice: number;
  previousClose: number;
  regularMarketTime: number | null;
  points: YahooCandle[];
};

export async function fetchYahooChart(symbol: string, range: YahooChartRange): Promise<YahooChartData> {
  const response = await fetch('/api/yahoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, range }),
  });
  const data = await response.json().catch(() => ({})) as YahooChartData & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Yahoo Finance 연결에 실패했습니다.');
  if (!data?.points?.length) throw new Error('Yahoo Finance에서 표시할 시세 데이터를 받지 못했습니다.');
  return data;
}
