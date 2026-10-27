import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createSeriesMarkers,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  fetchYahooChart,
  type YahooChartData,
  type YahooChartRange,
} from '../lib/yahooFinance';

const ranges: { value: YahooChartRange; label: string }[] = [
  { value: '1d', label: '1일' },
  { value: '5d', label: '5일' },
  { value: '1mo', label: '1개월' },
  { value: '3mo', label: '3개월' },
  { value: '1y', label: '1년' },
];

const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : '시세를 불러오지 못했습니다.';

function priceText(value: number, currency: string) {
  const formatted = new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: currency === 'KRW' ? 0 : 2,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
  return currency === 'KRW' ? `${formatted}원` : currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`;
}

export function YahooFinanceChart({
  symbol,
  label,
  initialRange = '3mo',
  markerTime,
  markerLabel = '매수',
}: {
  symbol: string;
  label: string;
  initialRange?: YahooChartRange;
  markerTime?: string;
  markerLabel?: string;
}) {
  const chartHost = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<YahooChartRange>(initialRange);
  const [data, setData] = useState<YahooChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    void fetchYahooChart(symbol, range)
      .then((result) => { if (active) setData(result); })
      .catch((reason) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [symbol, range, retryKey]);

  useEffect(() => {
    const host = chartHost.current;
    if (!host || !data) return;

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#7b8797',
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#eef1f4' },
        horzLines: { color: '#eef1f4' },
      },
      rightPriceScale: { borderColor: '#e7ebef', scaleMargins: { top: 0.08, bottom: 0.1 } },
      timeScale: { borderColor: '#e7ebef', timeVisible: range === '1d' || range === '5d', secondsVisible: false },
      crosshair: {
        vertLine: { color: '#8bb9f8', labelBackgroundColor: '#3182f6' },
        horzLine: { color: '#8bb9f8', labelBackgroundColor: '#3182f6' },
      },
      localization: {
        locale: 'ko-KR',
        priceFormatter: (price: number) => new Intl.NumberFormat('ko-KR', {
          maximumFractionDigits: data.currency === 'KRW' ? 0 : 2,
        }).format(price),
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00a878',
      downColor: '#f04452',
      wickUpColor: '#00a878',
      wickDownColor: '#f04452',
      borderVisible: false,
      priceLineColor: '#3182f6',
    });
    const candles: CandlestickData<UTCTimestamp>[] = data.points.map((point) => ({
      time: point.time as UTCTimestamp,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    }));
    series.setData(candles);
    if (markerTime && candles.length) {
      const markerTimestamp = Math.floor(new Date(markerTime).getTime() / 1000);
      if (Number.isFinite(markerTimestamp)) {
        const nearest = candles.reduce((best, candle) => Math.abs(Number(candle.time) - markerTimestamp) < Math.abs(Number(best.time) - markerTimestamp) ? candle : best);
        createSeriesMarkers(series, [{
          time: nearest.time,
          position: 'belowBar',
          color: '#3182f6',
          shape: 'arrowUp',
          text: markerLabel,
        }]);
      }
    }
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(([entry]) => {
      if (entry) chart.applyOptions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [data, range, markerLabel, markerTime]);

  const change = data ? data.currentPrice - data.previousClose : 0;
  const changeRate = data?.previousClose ? change / data.previousClose * 100 : 0;

  return (
    <>
      <div className="terminal-head yahoo-terminal-head">
        <div>
          <span className="stock-badge">{label.slice(0, 2)}</span>
          <div>
            <b>{label}</b>
            <small>{data ? `${data.exchangeName} · Yahoo Finance` : 'Yahoo Finance 시세 불러오는 중'}</small>
          </div>
        </div>
        {data && <div className="yahoo-price">
          <strong>{priceText(data.currentPrice, data.currency)}</strong>
          <em className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{changeRate.toFixed(2)}%</em>
        </div>}
      </div>
      <div className="chart-range yahoo-ranges" aria-label="차트 기간">
        {ranges.map((item) => <button key={item.value} className={range === item.value ? 'active' : ''} onClick={() => setRange(item.value)}>{item.label}</button>)}
        {data && <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(data.yahooSymbol)}`} target="_blank" rel="noreferrer">Yahoo Finance에서 보기 ↗</a>}
      </div>
      <div className="yahoo-chart-shell">
        <div ref={chartHost} className="yahoo-chart-canvas" aria-label={`${label} ${range} Yahoo Finance 캔들 차트`} />
        {loading && <div className="yahoo-chart-state">Yahoo Finance 시세를 불러오는 중입니다.</div>}
        {error && <div className="yahoo-chart-state error"><b>차트를 불러오지 못했습니다.</b><span>{error}</span><button onClick={() => setRetryKey((key) => key + 1)}>다시 시도</button></div>}
      </div>
      <p className="yahoo-disclaimer">Yahoo Finance 제공 시세이며 거래소 정책에 따라 실시간 또는 지연 데이터일 수 있습니다. 투자 판단의 단독 근거로 사용하지 마세요.</p>
    </>
  );
}
