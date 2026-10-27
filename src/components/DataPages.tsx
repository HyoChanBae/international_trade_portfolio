import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteHolding, fetchBots, fetchBotTradeHistory, fetchBotTrades, fetchCalendarEvents, fetchHoldings,
  fetchMarketReport, saveHolding, type Bot, type BotTrade, type CalendarEvent, type Holding, type MarketReportData,
} from '../lib/lukaApi';
import { snowflakeConfigured } from '../lib/snowflakeApi';
import { ReportDocument } from './ReportDocument';
import { YahooFinanceChart } from './YahooFinanceChart';
import botDescriptionKo from '../assets/bots/luka_bot_describe_korean.png';
import botDescriptionEn from '../assets/bots/luka_bot_describe_English.png';

type ModalSetter = (value: { title: string; body: string } | null) => void;

function Header({ title, description }: { title: string; description: string }) {
  return <div className="page-header"><div><h1>{title}</h1><p className="page-description">{description}</p></div><span className="market-badge"><i /> SNOWFLAKE</span></div>;
}

function SetupNotice() {
  if (snowflakeConfigured) return null;
  return <div className="data-state setup-state"><b>Snowflake API 연결 정보가 필요해요</b><p>Vercel의 서버 환경변수를 확인해 주세요.</p></div>;
}

function State({ loading, error, empty }: { loading: boolean; error: string; empty?: boolean }) {
  if (loading) return <div className="data-state">데이터를 불러오는 중입니다.</div>;
  if (error) return <div className="data-state error-state"><b>데이터를 불러오지 못했어요</b><p>{error}</p></div>;
  if (empty) return <div className="data-state">등록된 데이터가 없습니다.</div>;
  return null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const item = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [item.message, item.details, item.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length) return `${parts.join(' · ')}${item.code ? ` (${String(item.code)})` : ''}`;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return '알 수 없는 오류가 발생했습니다.';
}

export function SnowflakeBots({ scenario = false }: { scenario?: boolean; setModal: ModalSetter }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(snowflakeConfigured);
  const [error, setError] = useState('');
  const [tradeBot, setTradeBot] = useState<Bot | null>(null);
  const [summaryBot, setSummaryBot] = useState<Bot | null>(null);
  const [logicBot, setLogicBot] = useState<Bot | null>(null);
  const [tradeHistory, setTradeHistory] = useState<{ trades: BotTrade[]; currentPriceUpdatedAt: string } | null>(null);
  const [tradeError, setTradeError] = useState('');
  useEffect(() => {
    if (!snowflakeConfigured) return;
    fetchBots(scenario).then(setBots).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false));
  }, [scenario]);

  const showTrades = async (bot: Bot) => {
    setTradeBot(bot);
    setTradeHistory(null);
    setTradeError('');
    try {
      setTradeHistory(await fetchBotTradeHistory(bot.id, scenario));
    } catch (reason) {
      setTradeError(errorMessage(reason));
    }
  };

  return <div className="page enter">
    <Header title={scenario ? '봇 랭킹_시나리오' : '봇 랭킹'} description={scenario ? '가상 계좌 성과를 Snowflake 데이터로 비교해요.' : '최신 일별 성과를 기준으로 봇을 비교해요.'} />
    <SetupNotice />
    <article className="card league-card">
      <div className="card-head"><div><h3>{scenario ? 'AI 투자 봇 리그 (시나리오)' : 'AI 투자 봇 리그'}</h3><p className="subtext">{scenario ? 'BOT_SENARIO 계열 테이블 기준' : 'BOT · BOT_PERF_DAILY 기준'}</p></div><span className="chip blue">LIVE DATA</span></div>
      <State loading={loading} error={error} empty={!loading && !error && snowflakeConfigured && bots.length === 0} />
      {!loading && !error && bots.length > 0 && (scenario
        ? <div className="scenario-table original-scenario-table"><div className="scenario-head"><span>순위</span><span>봇</span><span>모델</span><span>전일 대비</span><span>누적 수익률</span><span>거래 시작일</span><span>거래 종료일</span><span>거래일</span><span>로직 · 관리</span></div>{bots.map((bot) => <div className="scenario-row" key={bot.id}><strong>{bot.rank}</strong><div><b>{bot.type}</b></div><span>{bot.model}</span><em className={bot.returnRate >= 0 ? 'up' : 'down'}>{bot.returnRate > 0 ? '+' : ''}{bot.returnRate.toFixed(1)}%</em><em className={bot.cumulative >= 0 ? 'up' : 'down'}>{bot.cumulative > 0 ? '+' : ''}{bot.cumulative.toFixed(1)}%</em><span>{bot.tradeStartDate || '—'}</span><span>{bot.tradeEndDate || '—'}</span><span>{bot.tradeDays ? `${bot.tradeDays}일` : '—'}</span><div className="scenario-actions"><button className="text-button logic-button" onClick={() => setLogicBot(bot)}>로직</button><button className="text-button" onClick={() => setSummaryBot(bot)}>상세</button><button className="text-button" onClick={() => showTrades(bot)}>거래내역</button></div></div>)}</div>
        : <div className="ranking-table original-ranking"><div className="rank-head"><span>순위</span><span>봇</span><span>모델</span><span>전일 대비</span><span>누적 수익률</span><span /></div>{bots.map((bot) => <div className="rank-row" key={bot.id}><strong>{bot.rank}</strong><div><b>{bot.name}</b><small>{bot.type}</small></div><span>{bot.model}</span><em className={bot.returnRate >= 0 ? 'up' : 'down'}>{bot.returnRate > 0 ? '+' : ''}{bot.returnRate.toFixed(2)}%</em><span className={bot.cumulative >= 0 ? 'up' : 'down'}>{bot.cumulative > 0 ? '+' : ''}{bot.cumulative.toFixed(2)}%</span><button className="text-button" onClick={() => showTrades(bot)}>상세정보</button></div>)}</div>)}
    </article>
    <article className="card bot-description-original"><img src={botDescriptionKo} alt="Luka 봇 설명 한국어"/><img src={botDescriptionEn} alt="Luka bot description English"/></article>
    {tradeBot && createPortal(<TradeDetailModal bot={tradeBot} history={tradeHistory} error={tradeError} close={() => setTradeBot(null)} />, document.body)}
    {summaryBot && createPortal(<ScenarioSummaryModal bot={summaryBot} close={() => setSummaryBot(null)} />, document.body)}
    {logicBot && createPortal(<BotLogicModal bot={logicBot} close={() => setLogicBot(null)} />, document.body)}
  </div>;
}

function BotLogicModal({ bot, close }: { bot: Bot; close: () => void }) {
  const identity = `${bot.code} ${bot.name} ${bot.description} ${bot.strategyType}`.toLowerCase();
  const market = /\b(us|usa)\b|미국/.test(identity) ? '미국 시장' : /\b(kor|kr)\b|한국|국내/.test(identity) ? '국내 시장' : '시장 범위 미지정';
  const horizon = /short[_\s-]?term|단기/.test(identity) ? '단기 매매' : /long[_\s-]?term|장기/.test(identity) ? '장기 운용' : '운용 기간 미지정';
  const approach = /sector|섹터/.test(identity) ? '섹터 단위 후보군을 사용하는 전략' : '개별 종목 후보군을 사용하는 전략';
  const inferredLogic = `${market}의 ${approach.replace('을 사용하는 전략', '을 대상으로')} ${horizon} 신호를 생성하는 전략입니다.`;
  const registeredLogic = bot.logic.trim();
  const logicText = registeredLogic && !/^[A-Za-z0-9_\-\s]+$/.test(registeredLogic) ? registeredLogic : inferredLogic;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="bot-logic-modal" role="dialog" aria-modal="true" aria-labelledby="bot-logic-title">
      <button className="modal-close" onClick={close} aria-label="로직 팝업 닫기">×</button>
      <span className="modal-kicker">BOT LOGIC</span>
      <h2 id="bot-logic-title">{bot.type || bot.name}</h2>
      <p className="bot-logic-code">{bot.code || bot.name} · {bot.model}</p>
      <div className="bot-logic-summary">
        <div><span>운용 시장</span><b>{market}</b></div>
        <div><span>운용 기간</span><b>{horizon}</b></div>
        <div><span>전략 분류</span><b>{bot.strategyType || approach}</b></div>
      </div>
      <article className="bot-logic-copy"><span>로직 설명</span><p>{logicText}</p></article>
      <article className="bot-logic-note"><b>화면에서 확인 가능한 분류</b><p>{market}을 대상으로 하는 {horizon}이며, {approach}으로 식별됩니다. 구체적인 진입·청산·손절 조건은 실제 봇 구현과 설정값을 기준으로 확인해야 합니다.</p></article>
      <button className="primary-button full" onClick={close}>확인</button>
    </section>
  </div>;
}

const price = (value: number) => value ? value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const quantity = (value: number) => value ? value.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '—';

function TradeDetailModal({ bot, history, error, close }: { bot: Bot; history: { trades: BotTrade[]; currentPriceUpdatedAt: string } | null; error: string; close: () => void }) {
  const [chartTrade, setChartTrade] = useState<BotTrade | null>(null);
  return <>
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="trade-detail-modal">
        <button className="modal-close" onClick={close}>×</button>
        <h2>봇 거래내역</h2>
        <div className="trade-detail-meta"><p>{bot.name}</p><span>{history?.currentPriceUpdatedAt ? `현재가 업데이트 시각 ${new Date(history.currentPriceUpdatedAt).toLocaleString('ko-KR')}` : ''}</span></div>
        {error ? <State loading={false} error={error}/> : !history ? <State loading error=""/> : history.trades.length === 0 ? <div className="data-state">이 봇의 거래내역이 아직 없습니다.</div> : <div className="trade-detail-scroll">
          <div className="trade-detail-row trade-detail-head"><span>종목명</span><span>종목코드</span><span>종목 선정 이유</span><span>구매단가</span><span>구매수</span><span>현재가</span><span>등락률</span><span>구매총액</span><span>현가치</span><span>구매일시</span></div>
          {history.trades.map((trade) => {
            const change = trade.buyPrice && trade.currentPrice ? (trade.currentPrice - trade.buyPrice) / trade.buyPrice * 100 : null;
            return <div className="trade-detail-row" key={trade.id}>
              <b>{trade.symbolName || '—'}</b><span>{trade.symbol || '—'}</span><p>{trade.reason || '—'}</p><span>{price(trade.buyPrice)}</span><span>{quantity(trade.quantity)}</span>
              <span className="trade-current-price"><span>{price(trade.currentPrice)}</span>{trade.symbol && <button type="button" onClick={() => setChartTrade(trade)}>차트</button>}</span>
              <em className={change == null ? '' : change >= 0 ? 'up' : 'down'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}</em><span>{price(trade.buyPrice * trade.quantity)}</span><span>{price(trade.currentPrice * trade.quantity)}</span><span>{trade.buyAt ? trade.buyAt.slice(0, 16).replace('T', ' ') : '—'}</span>
            </div>;
          })}
        </div>}
      </div>
    </div>
    {chartTrade && <div className="trade-chart-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setChartTrade(null)}>
      <section className="trade-chart-modal" role="dialog" aria-modal="true" aria-label={`${chartTrade.symbolName || chartTrade.symbol} 거래 차트`}>
        <header><div><h2>거래 차트</h2><p>{chartTrade.symbolName || chartTrade.symbol} · {chartTrade.buyAt ? `매수 ${new Date(chartTrade.buyAt).toLocaleString('ko-KR')}` : '매수시각 없음'}</p></div><button type="button" aria-label="차트 닫기" onClick={() => setChartTrade(null)}>×</button></header>
        <YahooFinanceChart key={chartTrade.id} symbol={chartTrade.symbol} label={chartTrade.symbolName || chartTrade.symbol} initialRange="3mo" markerTime={chartTrade.buyAt} />
      </section>
    </div>}
  </>;
}

function ScenarioSummaryModal({ bot, close }: { bot: Bot; close: () => void }) {
  const displayMoney = (value?: number) => value == null ? '—' : Math.round(value).toLocaleString('ko-KR');
  const fields = [
    ['거래 시작일', bot.tradeStartDate || '—'], ['거래 종료일', bot.tradeEndDate || '—'],
    ['거래일', bot.tradeDays ? `${bot.tradeDays}일` : '—'], ['총구매액', displayMoney(bot.totalBuyAmount)],
    ['구매평가액', displayMoney(bot.marketValue)], ['봇 가상 시작액', bot.hasAccount ? displayMoney(bot.startAmount) : '—'],
    ['가상 잔액', bot.hasAccount ? displayMoney(bot.virtualBalance) : '—'], ['봇 가상 가치액', bot.hasAccount ? displayMoney(bot.currentValue) : '—'],
  ];
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="scenario-summary-modal"><button className="modal-close" onClick={close}>×</button><h2>봇 상세</h2><p>{bot.type}</p><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{!bot.hasAccount && <div className="data-state">bot_senario_account 테이블이 없어 계좌 금액 정보는 표시하지 않았습니다.</div>}</div></div>;
}

export function SnowflakeReport({ final = false }: { final?: boolean }) {
  const [reports, setReports] = useState<{ market: MarketReportData | null; sector: MarketReportData | null }>({ market: null, sector: null });
  const [loading, setLoading] = useState(snowflakeConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!snowflakeConfigured) return;
    Promise.all([fetchMarketReport('MARKET'), fetchMarketReport('MACRO')])
      .then(([market, sector]) => setReports({ market, sector }))
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  return <div className="page enter report-page-live">
    <Header title={final ? '일일 리포트 최종' : '일일 리포트'} description="복잡한 시장 정보 대신, 지금 알아야 할 것부터 보여드려요."/>
    <SetupNotice/>
    {loading && <State loading error=""/>}
    {error && <State loading={false} error={error}/>}
    {!loading && !error && snowflakeConfigured && <section className="live-report-stack">
      <ReportDocument title="시장 리포트" data={reports.market} emptyMessage="아직 등록된 시장 리포트가 없습니다."/>
      <ReportDocument title="섹터 리포트" data={reports.sector} wide emptyMessage="아직 등록된 섹터 리포트가 없습니다."/>
    </section>}
  </div>;
}

export function SnowflakeTradingReport() {
  const [bot, setBot] = useState<Bot | null>(null);
  const [trades, setTrades] = useState<Awaited<ReturnType<typeof fetchBotTrades>>>([]);
  const [loading, setLoading] = useState(snowflakeConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!snowflakeConfigured) return;
    fetchBots(false).then(async (items) => {
      const leader = items[0] ?? null;
      setBot(leader);
      if (leader) setTrades(await fetchBotTrades(leader.id));
    }).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false));
  }, []);
  return <div className="page enter"><Header title="일일 트레이딩 리포트" description="최상위 봇의 최근 거래와 선택 근거를 확인해요."/><SetupNotice/><article className="card"><div className="card-head"><div><h3>{bot ? `${bot.name} 거래내역` : '최근 거래내역'}</h3><p className="subtext">BOT_TRADE · BOT_TRADE_CURRENT_INFO 기준</p></div><span className="chip green">{trades.length}건</span></div><State loading={loading} error={error} empty={!loading && !error && snowflakeConfigured && trades.length === 0}/>{trades.length > 0 && <div className="trade-table"><div className="trade-headline"><span>시간</span><span>종목</span><span>수량</span><span>매수가</span><span>선택 근거</span></div>{trades.map((trade) => <div className="trade-line" key={trade.id}><span>{trade.buyAt ? new Date(trade.buyAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span><b>{trade.symbolName || trade.symbol}</b><em className="buy">{trade.quantity.toLocaleString()}</em><span>{trade.buyPrice.toLocaleString()}</span><p>{trade.reason || '기록된 근거가 없습니다.'}</p></div>)}</div>}</article></div>;
}

const emptyHolding = (): Holding => ({
  brokerName: '', accountName: '', accountType: 'GENERAL', marketScope: 'DOMESTIC', investmentTerm: 'LONG',
  shortCode: '', stockName: '', currencyCode: 'KRW', quantity: 0, avgBuyPrice: 0, currentPrice: 0,
  exchangeRate: 1, memo: '',
});

export function AccountsPage() {
  const [rows, setRows] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(snowflakeConfigured);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const load = () => {
    if (!snowflakeConfigured) return;
    setLoading(true); setError('');
    fetchHoldings().then(setRows).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const patch = (index: number, changes: Partial<Holding>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...changes } : row));
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.quantity * row.currentPrice * row.exchangeRate, 0), [rows]);
  const profit = useMemo(() => rows.reduce((sum, row) => sum + row.quantity * (row.currentPrice - row.avgBuyPrice) * row.exchangeRate, 0), [rows]);
  const save = async (row: Holding, index: number) => {
    if (!row.brokerName.trim() || !row.accountName.trim() || (!row.shortCode.trim() && !row.stockName.trim())) {
      setError('증권사, 계좌명, 종목코드 또는 종목명을 입력해 주세요.'); return;
    }
    setSaving(index); setError('');
    try { await saveHolding(row); load(); } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(null); }
  };
  const remove = async (row: Holding, index: number) => {
    if (!row.holdingId) { setRows((current) => current.filter((_, i) => i !== index)); return; }
    if (!window.confirm(`${row.stockName || row.shortCode} 보유 내역을 삭제할까요?`)) return;
    try { await deleteHolding(row.holdingId); load(); } catch (reason) { setError(errorMessage(reason)); }
  };
  return <div className="page enter"><Header title="전체 계좌" description="Supabase에 이관한 계좌와 보유 종목을 한곳에서 관리해요."/><SetupNotice/><section className="account-summary"><article><span>전체 평가금액</span><strong>{Math.round(total).toLocaleString()}원</strong><small>{rows.length}개 종목</small></article><article><span>국내</span><strong>{rows.filter((r) => r.marketScope === 'DOMESTIC').length}개</strong><small>국내 보유 종목</small></article><article><span>해외</span><strong>{rows.filter((r) => r.marketScope === 'OVERSEAS').length}개</strong><small>해외 보유 종목</small></article><article><span>평가 손익</span><strong className={profit >= 0 ? 'up' : 'down'}>{profit > 0 ? '+' : ''}{Math.round(profit).toLocaleString()}원</strong><small>환율 반영</small></article></section><article className="card account-sheet"><div className="card-head"><div><h3>보유 종목 편집</h3><p className="subtext">셀을 수정한 뒤 해당 행의 저장 버튼을 눌러 주세요.</p></div><button className="primary-button" onClick={() => setRows((current) => [...current, emptyHolding()])}>＋ 행 추가</button></div><State loading={loading} error={error}/><div className="account-table-wrap"><table><thead><tr><th>#</th><th>구분</th><th>기간</th><th>증권사</th><th>계좌명</th><th>종목코드</th><th>종목명</th><th>통화</th><th>수량</th><th>평균단가</th><th>현재가</th><th>환율</th><th>메모</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr key={row.holdingId ?? `new-${index}`}><td>{index + 1}</td><td><select value={row.marketScope} onChange={(e) => patch(index, { marketScope: e.target.value as Holding['marketScope'], currencyCode: e.target.value === 'OVERSEAS' ? 'USD' : 'KRW', exchangeRate: e.target.value === 'OVERSEAS' ? 1300 : 1 })}><option value="DOMESTIC">국내</option><option value="OVERSEAS">해외</option></select></td><td><select value={row.investmentTerm} onChange={(e) => patch(index, { investmentTerm: e.target.value as Holding['investmentTerm'] })}><option value="LONG">장기</option><option value="MEDIUM">중기</option><option value="SHORT">단기</option></select></td>{(['brokerName','accountName','shortCode','stockName','currencyCode'] as const).map((key) => <td key={key}><input value={row[key]} onChange={(e) => patch(index, { [key]: e.target.value })}/></td>)}{(['quantity','avgBuyPrice','currentPrice','exchangeRate'] as const).map((key) => <td key={key}><input type="number" value={row[key]} onChange={(e) => patch(index, { [key]: Number(e.target.value) })}/></td>)}<td><input value={row.memo} onChange={(e) => patch(index, { memo: e.target.value })}/></td><td className="row-actions"><button className="text-button" disabled={saving === index} onClick={() => save(row, index)}>{saving === index ? '저장 중' : '저장'}</button><button className="danger-button" onClick={() => remove(row, index)}>삭제</button></td></tr>)}</tbody></table></div></article></div>;
}

const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [importance, setImportance] = useState(0);
  const [selected, setSelected] = useState(() => localDateKey(new Date()));
  const [loading, setLoading] = useState(snowflakeConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!snowflakeConfigured) return;
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    setLoading(true); setError('');
    fetchCalendarEvents(from, to).then(setEvents).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false));
  }, [month]);
  const visible = events.filter((event) => event.importance >= importance);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const selectedEvents = visible.filter((event) => event.releaseAt.slice(0, 10) === selected);
  const moveMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelected(localDateKey(next));
  };
  const goToday = () => {
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(localDateKey(today));
  };

  return <div className="page enter calendar-page">
    <Header title="경제 캘린더" description="MACRO_RELEASE_CALENDAR의 주요 지표 발표 일정을 확인해요."/>
    <SetupNotice/>
    <article className="card calendar-toolbar-react">
      <div className="calendar-month-nav">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button>
        <h2>{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
        <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">›</button>
      </div>
      <div className="calendar-toolbar-actions">
        <button type="button" className="calendar-today" onClick={goToday}>오늘</button>
        <label><span>중요도</span><select value={importance} onChange={(e) => setImportance(Number(e.target.value))}><option value={0}>전체</option><option value={3}>높음</option><option value={2}>보통 이상</option><option value={1}>낮음 이상</option></select></label>
      </div>
    </article>
    <State loading={loading} error={error}/>
    <section className="calendar-react-layout">
      <article className="card calendar-react">
        <div className="calendar-weekdays-react">{['일','월','화','수','목','금','토'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-days">
          {Array.from({ length: firstDay }, (_, i) => <span className="blank" key={`blank-${i}`}/>) }
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const key = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayEvents = visible.filter((event) => event.releaseAt.slice(0,10) === key);
            return <button
              type="button"
              key={key}
              className={`${selected === key ? 'selected' : ''} ${dayEvents.length ? 'has-events' : ''}`}
              onClick={() => setSelected(key)}
              aria-label={`${month.getMonth() + 1}월 ${day}일, 일정 ${dayEvents.length}건`}
            >
              <b>{day}</b>
              <span className="calendar-day-events">{dayEvents.slice(0,3).map((event) => <small key={event.key}><i className={`importance-${event.importance}`}/><span>{event.name}</span></small>)}</span>
              {dayEvents.length > 3 && <em>+{dayEvents.length - 3}</em>}
              {dayEvents.length > 0 && <span className="calendar-day-summary" aria-hidden="true"><span>{dayEvents.slice(0,3).map((event) => <i className={`importance-${event.importance}`} key={event.key}/>)}</span><strong>{dayEvents.length}</strong></span>}
            </button>;
          })}
        </div>
      </article>
      <aside className="card calendar-agenda-react">
        <header><h3>{selected} 일정</h3><span>{selectedEvents.length}건</span></header>
        {selectedEvents.length === 0 ? <p className="subtext">등록된 일정이 없습니다.</p> : selectedEvents.map((event) => <div className="calendar-event" key={event.key}><div><i className={`importance-${event.importance}`}/><b>{event.name}</b></div><p>{new Date(event.releaseAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · {event.source}</p><small>{event.category} · {event.referencePeriod}</small>{event.url && <a href={event.url} target="_blank" rel="noreferrer">원문 보기</a>}</div>)}
      </aside>
    </section>
  </div>;
}
