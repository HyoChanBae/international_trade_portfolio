import { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from './lib/auth';
import { CalendarPage, SnowflakeBots, SnowflakeReport, SnowflakeTradingReport } from './components/DataPages';
import { AccountsPage } from './components/AllAccountsPage';
import { InvestmentJournalSheet } from './components/InvestmentJournal';
import { InvestmentHorizonPage } from './components/InvestmentHorizon';
import { YahooFinanceChart } from './components/YahooFinanceChart';
import { HmrcTradeMonitor } from './components/HmrcTradeMonitor';
import { userDisplayName } from './lib/auth';
import type { LukaAuthSession } from './components/AuthGate';
import './app.css';

type Tab = 'bots' | 'botScenario' | 'dashboard' | 'accounts' | 'calendar' | 'scenario' | 'dailyReport' | 'tradingReport' | 'journal' | 'journalLong' | 'journalMid' | 'journalShort' | 'reportFinal' | 'chart' | 'reportSettings' | 'alerts' | 'plan' | 'hmrcTrade';
type ModalInfo = { title: string; body: string } | null;

const navItems: { id: Tab; label: string; shortLabel: string; icon: string; sub?: boolean }[] = [
  // 실계좌 API 연동 전까지 일반 봇 랭킹은 사용자 혼동을 막기 위해 숨깁니다.
  // { id: 'bots', label: '봇 랭킹', shortLabel: '봇 랭킹', icon: '◈' },
  { id: 'botScenario', label: '봇 랭킹_시나리오', shortLabel: '봇 시나리오', icon: '◈' },
  { id: 'dashboard', label: '대시보드', shortLabel: '대시보드', icon: '⌂' },
  { id: 'hmrcTrade', label: 'UK Trade Monitor', shortLabel: 'UK Trade', icon: '▥' },
  { id: 'scenario', label: '내 투자 시나리오', shortLabel: '시나리오', icon: '＋' },
  { id: 'dailyReport', label: '일일 리포트', shortLabel: '시장 리포트', icon: '▤' },
  { id: 'tradingReport', label: '일일 트레이딩 리포트', shortLabel: '트레이딩', icon: '↗' },
  { id: 'journal', label: '투자 기록', shortLabel: '투자 기록', icon: '▦' },
  { id: 'accounts', label: '전체', shortLabel: '전체', icon: '–', sub: true },
  { id: 'journalLong', label: '장기 투자', shortLabel: '장기', icon: '–', sub: true },
  { id: 'journalMid', label: '중기 투자', shortLabel: '중기', icon: '–', sub: true },
  { id: 'journalShort', label: '단기 투자', shortLabel: '단기', icon: '–', sub: true },
  { id: 'reportFinal', label: '일일 리포트 최종', shortLabel: '최종 리포트', icon: '▤' },
  { id: 'chart', label: '차트', shortLabel: '차트', icon: '⌁' },
  { id: 'reportSettings', label: '리포트 알림', shortLabel: '리포트 알림', icon: '▤' },
  { id: 'alerts', label: '알림 전략', shortLabel: '알림', icon: '◎' },
  { id: 'plan', label: '투자 플랜', shortLabel: '투자 플랜', icon: '◇' },
  { id: 'calendar', label: '캘린더', shortLabel: '캘린더', icon: '▣' },
];

const chartPaths: Record<string, string> = {
  '1개월': 'M0 167 C58 155 82 174 132 143 S217 139 270 114 S351 127 405 96 S493 111 552 72 S651 87 711 49 S792 61 850 29',
  '3개월': 'M0 178 C70 168 113 139 165 153 S258 116 309 127 S401 82 465 101 S560 67 622 77 S735 39 850 23',
  '1년': 'M0 180 C64 136 113 159 169 127 S267 155 332 104 S426 124 483 77 S576 98 649 57 S751 63 850 19',
};

const decisions = [
  { title: 'SMR은 그대로 유지했어요', description: '발행 가능성은 부담이지만 계약 모멘텀이 더 중요하다고 판단했어요.', tag: 'HOLD', tone: 'green' },
  { title: '반도체 ETF를 3% 추가했어요', description: '단기 변동성 구간 하단에서 위험 예산 안으로 분할 매수했어요.', tag: 'BUY', tone: 'blue' },
  { title: '고위험 신규 매수는 잠시 멈췄어요', description: 'CPI 발표 전까지 전체 위험 예산을 20% 낮게 유지해요.', tag: 'LIMIT', tone: 'gray' },
];

const portfolio = [
  { symbol: 'NVDA', name: '엔비디아', category: 'AI 반도체', weight: 22, returnRate: 11.8, color: '#76b900' },
  { symbol: 'SMR', name: '뉴스케일 파워', category: '차세대 원전', weight: 16, returnRate: -4.2, color: '#4767ef' },
  { symbol: 'QQQ', name: '나스닥 100 ETF', category: '미국 성장주', weight: 34, returnRate: 6.1, color: '#6b58d7' },
  { symbol: '₩', name: '현금', category: '위험 대비 자금', weight: 28, returnRate: null, color: '#98a2b3' },
];

const bots = [
  { rank: 1, name: 'trading_buy1_bot', type: '파도타기', model: 'GPT', returnRate: 12.4, cumulative: -5.1, trades: 34 },
  { rank: 2, name: 'trading_buy2_bot', type: '추세 추종형', model: 'GPT', returnRate: 10.8, cumulative: -3.2, trades: 18 },
  { rank: 3, name: 'MacroShield', type: '거시 안정형', model: 'Claude', returnRate: 9.7, cumulative: -2.4, trades: 11 },
  { rank: 4, name: 'BookValue', type: '가치투자', model: 'GPT', returnRate: 8.1, cumulative: -4.0, trades: 9 },
  { rank: 5, name: 'VolQuant', type: '변동성 퀀트', model: 'Rule+LLM', returnRate: 6.8, cumulative: -7.8, trades: 57 },
];

const botTemplates = [
  { icon: '↗', title: '파도타기', body: '중간 주기의 상승과 하락 흐름을 읽고 분할 매매해요.', tag: 'Swing' },
  { icon: '◎', title: '단일 종목', body: '뉴스와 공시를 한 종목 중심으로 깊게 분석해요.', tag: 'Research' },
  { icon: '▦', title: '섹터 로테이션', body: 'AI·원전·반도체 섹터의 상대 강도를 비교해요.', tag: 'Sector' },
  { icon: '◇', title: '가치 투자', body: '재무 지표와 기업 가치를 바탕으로 저평가 종목을 찾아요.', tag: 'Value' },
];

const money = (value: number) => new Intl.NumberFormat('ko-KR').format(value);

export function App({ auth }: { auth: LukaAuthSession }) {
  const [tab, setTab] = useState<Tab>('botScenario');
  const [period, setPeriod] = useState('1개월');
  const [modal, setModal] = useState<ModalInfo>(null);
  const { user, logout } = auth;

  return (
    <>
      <div className="app-shell">
        <Sidebar tab={tab} setTab={setTab} user={user} onSignOut={logout} />
        <main className="main">
          <header className="topbar">
            <div className="brand-mobile"><span className="brand-mark">L</span> Luka</div>
            <span className="profile" aria-label="내 프로필">{userDisplayName(user)[0]}</span>
          </header>
          {tab === 'dashboard' && <Home period={period} setPeriod={setPeriod} setModal={setModal} setTab={setTab} />}
          {tab === 'hmrcTrade' && <HmrcTradeMonitor />}
          {tab === 'bots' && <SnowflakeBots setModal={setModal} />}
          {tab === 'botScenario' && <SnowflakeBots scenario setModal={setModal} />}
          {tab === 'accounts' && <AccountsPage />}
          {tab === 'calendar' && <CalendarPage />}
          {tab === 'scenario' && <Scenario />}
          {tab === 'dailyReport' && <SnowflakeReport />}
          {tab === 'tradingReport' && <SnowflakeTradingReport />}
          {tab === 'journal' && <div className="page enter journal-page"><PageHeader title="투자 기록" description="생각부터 투자 내역까지, 셀에 바로 기록하세요."/><InvestmentJournalSheet /></div>}
          {tab === 'journalLong' && <div className="page enter journal-page"><InvestmentHorizonPage key="long" horizon="long" /></div>}
          {tab === 'journalMid' && <div className="page enter journal-page"><InvestmentHorizonPage key="mid" horizon="mid" /></div>}
          {tab === 'journalShort' && <div className="page enter journal-page"><InvestmentHorizonPage key="short" horizon="short" /></div>}
          {tab === 'reportFinal' && <SnowflakeReport final />}
          {tab === 'chart' && <ChartPage />}
          {tab === 'reportSettings' && <ReportNotifications />}
          {tab === 'alerts' && <Alerts />}
          {tab === 'plan' && <InvestmentPlan />}
        </main>
        {modal && <DetailModal info={modal} close={() => setModal(null)} />}
      </div>
    </>
  );
}

function Sidebar({ tab, setTab, user, onSignOut }: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  user: AuthUser;
  onSignOut: () => Promise<void>;
}) {
  const name = userDisplayName(user);
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">L</span><span>Luka</span></div>
      <div className="sidebar-user"><span>{name[0]}</span><div><b>{name}</b><small>{user.userId}</small></div></div>
      <p className="nav-caption">MY INVESTMENT</p>
      <nav className="side-nav">
        {navItems.map((item) => (
          <button key={item.id} className={`${tab === item.id ? 'active' : ''} ${item.sub ? 'nav-sub-item' : ''}`} onClick={() => setTab(item.id)}>
            <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
        <button className="nav-logout" onClick={() => void onSignOut()}><span className="nav-icon">↪</span><span>로그아웃</span></button>
      </nav>
      <div className="side-note">
        <div className="side-note-icon">☂</div>
        <b>주식창을 덜 봐도 괜찮아요</b>
        <p>중요한 판단과 위험 신호만 Luka가 정리해 드려요.</p>
      </div>
    </aside>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1><p className="page-description">{description}</p></div>
      <span className="market-badge"><i /> PAPER TRADING</span>
    </div>
  );
}

function Home({ period, setPeriod, setModal, setTab }: { period: string; setPeriod: (v: string) => void; setModal: (v: ModalInfo) => void; setTab: (v: Tab) => void }) {
  return (
    <div className="page enter">
      <PageHeader title="내 투자" description="복잡한 시장 정보 대신, 지금 알아야 할 것부터 보여드려요." />
      <section className="grid">
        <article className="card asset-card span-8">
          <div className="card-head"><div><p className="eyebrow">가상 평가금액</p><h2 className="asset">10,842,500<span>원</span></h2><p className="gain">이번 달 +3.21% <small>벤치마크 +1.64%</small></p></div><div className="periods">{Object.keys(chartPaths).map((p) => <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>)}</div></div>
          <PerformanceChart period={period} />
          <div className="metrics"><Metric label="누적 수익률" value="+8.43%" positive /><Metric label="최대 낙폭 MDD" value="-5.8%" /><Metric label="현금 비중" value="28%" /></div>
        </article>
        <article className="card risk-card span-4">
          <div className="card-head"><h3>지금 투자 상태</h3><span className="chip amber">주의</span></div>
          <div className="risk-main"><div className="risk-symbol">!</div><div><b>CPI 발표 전이에요</b><p>고위험 신규 매수를 줄이고 있어요.</p></div></div>
          <div className="event-list"><div><span>소비자물가지수</span><b>이번 주</b></div><div><span>기대 인플레이션</span><b>관찰 중</b></div><div><span>SEC 신규발행 / ATM</span><b>보유종목 감시</b></div></div>
          <button className="soft-button" onClick={() => setModal({ title: '현재 위험 신호', body: 'CPI 발표가 가까워 신규 고변동 포지션 한도를 낮추고 있습니다. 보유 단일 종목의 신규 발행 및 ATM 관련 문서를 우선 감시해요.' })}>위험 신호 자세히 보기</button>
        </article>
        <article className="card span-7">
          <div className="card-head"><h3>오늘 AI는 이렇게 판단했어요</h3><button className="text-button">전체 3건</button></div>
          <div className="decision-list">{decisions.map((item, index) => <button className="decision" key={item.title} onClick={() => setModal({ title: item.title, body: index === 0 ? '긍정: 원전 계약 모멘텀과 섹터 상대 강도가 유지되고 있어요. 부정: 신규 ATM 가능성과 높은 변동성을 함께 고려했습니다. 종합 신뢰도는 72%예요.' : item.description })}><div><b>{item.title}</b><p>{item.description}</p></div><span className={`chip ${item.tone}`}>{item.tag}</span><i>›</i></button>)}</div>
        </article>
        <article className="card best-bot span-5">
          <div className="card-head"><h3>이번 달 가장 잘한 AI</h3><button className="text-button" onClick={() => setTab('bots')}>전체 랭킹</button></div>
          <div className="winner"><div className="trophy">1</div><div><p>trading_buy1_bot · 파도타기</p><strong>+12.4%</strong><span>전일 대비 · 누적 -5.1% · 34회 거래</span></div></div>
          {bots.slice(1, 3).map((bot) => <div className="mini-rank" key={bot.name}><span>{bot.rank}</span><div><b>{bot.name}</b><small>{bot.type}</small></div><em>+{bot.returnRate}%</em></div>)}
        </article>
        <article className="card span-7">
          <div className="card-head"><h3>내 포트폴리오</h3><button className="text-button">상세 보기</button></div>
          <div className="allocation" aria-label="자산 배분">{portfolio.map((item) => <span key={item.name} style={{ width: `${item.weight}%`, background: item.color }} />)}</div>
          <div className="portfolio-list">{portfolio.map((item) => <div className="portfolio-row" key={item.name}><div className="stock-logo" style={{ color: item.color }}>{item.symbol}</div><div className="stock-info"><b>{item.name}</b><span>{item.category}</span></div><strong>{item.weight}%</strong><em className={(item.returnRate ?? 0) >= 0 ? 'up' : 'down'}>{item.returnRate === null ? '—' : `${item.returnRate > 0 ? '+' : ''}${item.returnRate}%`}</em></div>)}</div>
        </article>
        <article className="card summary-card span-5">
          <div className="card-head"><h3>오늘 꼭 볼 것만 요약했어요</h3><span className="date">9월 30일</span></div>
          <Summary icon="↗" label="시장" title="위험선호 중립" body="대형 기술주는 강하지만 금리 민감 성장주는 혼조예요." />
          <Summary icon="▦" label="매크로" title="CPI 전 신규 위험 축소" body="발표 전까지 신규 고변동 포지션 한도를 낮췄어요." />
          <Summary icon="◎" label="보유종목" title="SMR 공시를 우선 감시" body="신규 발행 관련 SEC 문서와 계약 뉴스를 함께 봐요." />
        </article>
      </section>
    </div>
  );
}

function PerformanceChart({ period }: { period: string }) {
  return (
    <div className="chart-wrap">
      <div className="chart-tooltip"><b>10,842,500원</b><span>9월 30일</span></div>
      <svg viewBox="0 0 850 205" preserveAspectRatio="none" role="img" aria-label={`${period} 수익률 차트`}>
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3182f6" stopOpacity=".22"/><stop offset="100%" stopColor="#3182f6" stopOpacity="0"/></linearGradient></defs>
        <path d={`${chartPaths[period]} L850 205 L0 205 Z`} fill="url(#area)" />
        <path d={chartPaths[period]} fill="none" stroke="#3182f6" strokeWidth="4" strokeLinecap="round" />
        <path d="M0 184 C130 175 196 168 280 157 S438 146 535 131 S705 121 850 101" fill="none" stroke="#c5ccd5" strokeWidth="2" strokeDasharray="7 8" />
        <circle cx="850" cy={period === '1개월' ? 29 : period === '3개월' ? 23 : 19} r="6" fill="#fff" stroke="#3182f6" strokeWidth="4" />
      </svg>
      <div className="chart-labels"><span>9월 1일</span><span>9월 15일</span><span>오늘</span></div>
    </div>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return <div className="metric"><span>{label}</span><b className={positive ? 'up' : ''}>{value}</b></div>;
}

function Summary({ icon, label, title, body }: { icon: string; label: string; title: string; body: string }) {
  return <div className="summary"><div className="summary-icon">{icon}</div><div><span>{label}</span><b>{title}</b><p>{body}</p></div></div>;
}

function Bots({ setModal }: { setModal: (v: ModalInfo) => void }) {
  return (
    <div className="page enter">
      <PageHeader title="봇 랭킹" description="복잡한 시장 정보 대신, 지금 알아야 할 것부터 보여드려요." />
      <section className="grid">
        <article className="card span-12 league-card">
          <div className="card-head">
            <div><h3>AI 투자 봇 리그</h3><p className="subtext">전일 대비와 누적 수익률을 함께 보고, 상세정보에서 거래 근거까지 확인할 수 있어요.</p></div>
            <button className="primary-button">내 봇 만들기</button>
          </div>
          <div className="ranking-table original-ranking">
            <div className="rank-head"><span>순위</span><span>봇</span><span>모델</span><span>전일 대비</span><span>누적 수익률</span><span /></div>
            {bots.map((bot) => (
              <div key={bot.name} className="rank-row">
                <strong>{bot.rank}</strong>
                <div><b>{bot.name}</b><small>{bot.type}</small></div>
                <span>{bot.model}</span><em>+{bot.returnRate}%</em>
                <span className={bot.cumulative >= 0 ? 'up' : 'down'}>{bot.cumulative > 0 ? '+' : ''}{bot.cumulative}%</span>
                <button className="text-button" onClick={() => setModal({ title: `${bot.name} 거래내역`, body: `${bot.type} 전략 · ${bot.model} 모델. 최근 ${bot.trades}회 거래했으며, 더미 성과는 전일 대비 +${bot.returnRate}%, 누적 ${bot.cumulative}%입니다.` })}>상세정보</button>
              </div>
            ))}
          </div>
        </article>
        <article className="card span-12 bot-guide">
          <div className="guide-copy"><p className="eyebrow">HOW LUKA BOTS WORK</p><h2>서로 다른 전략을 같은 기준으로<br />투명하게 비교해요</h2><p>각 봇은 정해진 투자 원칙에 따라 종목을 고르고, 모든 판단과 거래 근거를 기록합니다.</p></div>
          <div className="guide-flow"><div><span>01</span><b>시장 데이터</b><small>가격 · 공시 · 뉴스</small></div><i>→</i><div><span>02</span><b>AI 전략 판단</b><small>근거와 위험 분석</small></div><i>→</i><div><span>03</span><b>가상 매매</b><small>성과와 거래 기록</small></div></div>
        </article>
        <article className="card span-12"><div className="card-head"><div><h3>전략 유형</h3><p className="subtext">원본 Luka 프로젝트의 봇 유형을 더미 화면으로 구성했어요.</p></div></div><div className="template-grid">{botTemplates.map((item) => <button className="template" key={item.title} onClick={() => setModal({ title: `${item.title} 봇`, body: item.body })}><span className="template-icon">{item.icon}</span><b>{item.title}</b><p>{item.body}</p><em>{item.tag}</em></button>)}</div></article>
      </section>
    </div>
  );
}

function BotScenario({ setModal }: { setModal: (v: ModalInfo) => void }) {
  return <div className="page enter"><PageHeader title="봇 랭킹_시나리오" description="봇별 가상 운용 기간과 계좌 성과를 한눈에 비교해요." /><section className="grid"><article className="card span-12"><div className="card-head"><div><h3>AI 투자 봇 리그 (시나리오)</h3><p className="subtext">동일한 시작금으로 운용한 가상 계좌 기준입니다.</p></div><span className="chip blue">2026.09.30 기준</span></div><div className="scenario-table"><div className="scenario-head"><span>순위</span><span>봇</span><span>전략</span><span>시작금</span><span>평가금</span><span>수익률</span><span>운용일</span><span /></div>{bots.map((bot, i) => { const start = 10000000; const value = Math.round(start * (1 + bot.returnRate / 100)); return <div className="scenario-row" key={bot.name}><strong>{bot.rank}</strong><div><b>{bot.name}</b><small>{bot.model}</small></div><span>{bot.type}</span><span>{money(start)}원</span><span>{money(value)}원</span><em>+{bot.returnRate}%</em><span>{28 - i * 2}일</span><button className="text-button" onClick={() => setModal({ title: `${bot.name} 시나리오`, body: `가상 시작금 ${money(start)}원으로 ${28 - i * 2}일간 운용한 샘플입니다. 현재 평가금액은 ${money(value)}원이에요.` })}>상세</button></div>})}</div></article></section></div>;
}

function Scenario() {
  const [capital, setCapital] = useState(10000000);
  const [strategy, setStrategy] = useState('지수 안정형');
  const [risk, setRisk] = useState('중립');
  const [ran, setRan] = useState(false);
  const rate = strategy === '파도타기' ? 1.8 : strategy === '단일 종목' ? 2.2 : strategy === '가치 투자' ? 1.3 : 1.1;
  const result = useMemo(() => Math.round(capital * Math.pow(1 + rate / 100, 12)), [capital, rate]);
  return <div className="page enter"><PageHeader title="투자 시나리오" description="실계좌 연결 없이 가상의 금액과 전략으로 먼저 테스트해 보세요." /><section className="grid"><article className="card span-6"><div className="step"><span>1</span><b>기본 조건을 입력해 주세요</b></div><div className="form-grid"><label>초기 투자금<div className="input-with-unit"><input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))}/><span>원</span></div></label><label>기준 통화<select><option>KRW</option><option>USD</option></select></label><label>봇 유형<select value={strategy} onChange={(e) => setStrategy(e.target.value)}><option>지수 안정형</option><option>파도타기</option><option>단일 종목</option><option>가치 투자</option></select></label><label>위험 성향<select value={risk} onChange={(e) => setRisk(e.target.value)}><option>보수적</option><option>중립</option><option>공격적</option></select></label><label>목표 수익률<input defaultValue="12%" /></label><label>최대 허용 하락률<input defaultValue="-10%" /></label></div><button className="primary-button full" onClick={() => setRan(true)}>시나리오 실행하기</button></article><article className={`card result-card span-6 ${ran ? 'show' : ''}`}><div className="step"><span>2</span><b>12개월 예상 시나리오</b></div>{ran ? <><p className="eyebrow">가정 평가금액</p><h2 className="scenario-value">{money(result)}<span>원</span></h2><p className="gain">월 {rate}% 단순 가정 · {strategy} · {risk}</p><div className="result-bars"><div><span>주식 / ETF</span><b>70%</b></div><i><span style={{ width: '70%' }}/></i><div><span>현금 버퍼</span><b>30%</b></div><i><span style={{ width: '30%' }}/></i></div><div className="notice">이 결과는 UI 확인용 단순 시뮬레이션이며 실제 수익을 예측하지 않아요.</div></> : <div className="empty-result"><span>↗</span><b>아직 실행 전이에요</b><p>왼쪽 설정을 확인하고 시나리오를 실행해 주세요.</p></div>}</article></section></div>;
}

function MarketReport({ final = false }: { final?: boolean }) {
  return <div className="page enter"><PageHeader title={final ? '일일 리포트 최종' : '일일 리포트'} description="복잡한 시장 정보 대신, 지금 알아야 할 것부터 보여드려요." /><section className="grid"><article className="card span-8 report-card"><div className="report-cover"><span>DAILY MARKET REPORT · 2026.09.30</span><h2>기술주는 견조하지만<br/>지표 발표를 기다리고 있어요</h2><p>미국 증시는 대형 기술주를 중심으로 버텼지만 금리와 달러가 다시 강해지며 위험 선호는 중립 수준에 머물렀어요.</p></div><div className="report-sections"><Summary icon="↗" label="오늘의 시장 한 줄 요약" title="위험선호는 중립이에요" body="대형 기술주는 상대적으로 강하지만 성장주의 변동성이 커지고 있어요."/><Summary icon="▦" label="연준 / 금리" title="주요 지표 발표 전 경계 구간" body="금리 기대가 다시 흔들릴 수 있어 신규 위험 노출을 줄였어요."/><Summary icon="◎" label="보유종목" title="SMR 공시 이벤트를 우선 감시" body="신규 발행 가능성과 계약 모멘텀을 함께 추적하고 있어요."/></div></article><article className="card span-4 market-dash"><h3>Market Dashboard</h3><p className="subtext">주요 지표 상태 핵심 요약</p><MarketGauge label="S&P 500" value="5,738.17" change="+0.42%" positive/><MarketGauge label="미국 10년물" value="4.12%" change="+3bp"/><MarketGauge label="달러 인덱스" value="100.84" change="+0.18%"/><MarketGauge label="VIX" value="16.73" change="-2.11%" positive/><div className="event-box"><span>오늘 체크할 이벤트</span><b>21:30 미국 소비자물가지수</b><p>예상치와 근원 물가의 방향을 함께 확인하세요.</p></div></article><article className="card span-12 report-table-card"><div className="card-head"><h3>Asset Impact</h3><span className="chip">종합 시장 영향</span></div><div className="impact-grid"><div><span>미국 주식</span><b className="up">긍정</b><p>AI 대형주 실적 기대 유지</p></div><div><span>국내 반도체</span><b>중립</b><p>환율 상승과 외국인 수급 혼조</p></div><div><span>장기채</span><b className="down">부정</b><p>물가 경계로 금리 상방 압력</p></div><div><span>원전 / 전력</span><b className="up">긍정</b><p>데이터센터 전력 수요 기대</p></div></div></article></section></div>;
}

function MarketGauge({ label, value, change, positive }: { label: string; value: string; change: string; positive?: boolean }) {
  return <div className="market-row"><span>{label}</span><b>{value}</b><em className={positive ? 'up' : ''}>{change}</em></div>;
}

function TradingReport() {
  const trades = [{ time: '09:42', symbol: 'NVDA', action: '매수', price: '$131.20', reason: '거래량과 기술적 추세 동시 개선' }, { time: '11:18', symbol: 'SMR', action: '유지', price: '$18.84', reason: '계약 모멘텀 유효, ATM 위험 관찰' }, { time: '14:05', symbol: 'QQQ', action: '매수', price: '$492.10', reason: '지수 ETF로 변동성 노출 조절' }];
  return <div className="page enter"><PageHeader title="일일 트레이딩 리포트" description="봇이 오늘 무엇을 보고 판단했는지 차트와 거래 근거로 확인해요." /><section className="grid"><article className="card span-12 trading-terminal"><div className="terminal-head"><div><span className="stock-badge">NVDA</span><div><b>NVIDIA</b><small>NASDAQ · 실시간 지연 샘플</small></div></div><div><strong>$131.20</strong><em>+2.48%</em></div></div><TradingChart /><div className="chart-range"><button>1일</button><button className="active">1주</button><button>1개월</button><button>3개월</button></div></article><article className="card span-12"><div className="card-head"><div><h3>오늘의 봇 거래내역</h3><p className="subtext">원본 BOT_TRADE 구조를 기준으로 만든 더미데이터입니다.</p></div><span className="chip green">3건</span></div><div className="trade-table"><div className="trade-headline"><span>시간</span><span>종목</span><span>판단</span><span>가격</span><span>선택 근거</span></div>{trades.map((trade) => <div className="trade-line" key={trade.time}><span>{trade.time}</span><b>{trade.symbol}</b><em className={trade.action === '매수' ? 'buy' : 'hold'}>{trade.action}</em><span>{trade.price}</span><p>{trade.reason}</p></div>)}</div></article></section></div>;
}

function TradingChart() {
  return <div className="terminal-chart"><div className="price-axis"><span>134.00</span><span>131.00</span><span>128.00</span><span>125.00</span></div><svg viewBox="0 0 1000 300" preserveAspectRatio="none"><defs><linearGradient id="tradeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3182f6" stopOpacity=".22"/><stop offset="1" stopColor="#3182f6" stopOpacity="0"/></linearGradient></defs><path d="M0 246 C60 231 78 250 128 215 S210 227 268 178 S355 197 421 160 S507 178 570 119 S662 145 731 86 S815 107 880 59 S946 62 1000 28 L1000 300 L0 300Z" fill="url(#tradeArea)"/><path d="M0 246 C60 231 78 250 128 215 S210 227 268 178 S355 197 421 160 S507 178 570 119 S662 145 731 86 S815 107 880 59 S946 62 1000 28" fill="none" stroke="#3182f6" strokeWidth="3"/><line x1="0" y1="160" x2="1000" y2="160" stroke="#e7ebef" strokeDasharray="5 6"/><circle cx="731" cy="86" r="7" fill="#3182f6"/><text x="744" y="79" fontSize="12" fill="#3182f6">BUY</text></svg></div>;
}

function ChartPage() {
  const [symbol, setSymbol] = useState('NVDA');
  const labels: Record<string, string> = { NVDA: 'NVDA', SMR: 'SMR', QQQ: 'QQQ', '005930': '삼성전자' };
  return <div className="page enter"><PageHeader title="차트" description="Yahoo Finance 시세로 관심 종목의 실제 가격 흐름을 확인해요." /><article className="card chart-page-card yahoo-chart-card"><div className="symbol-tabs">{Object.keys(labels).map((item) => <button key={item} className={symbol === item ? 'active' : ''} onClick={() => setSymbol(item)}>{item}</button>)}</div><YahooFinanceChart symbol={symbol} label={labels[symbol]} /></article></div>;
}

function ReportSettings() {
  const [settings, setSettings] = useState([['시장 흐름', true], ['연준 / 금리', true], ['환율', true], ['SEC 공시', true], ['개별종목 뉴스', false]] as [string, boolean][]);
  return <article className="card span-4 settings-card"><h3>리포트 구성</h3><p className="subtext">매일 보고 싶은 항목을 선택하세요.</p>{settings.map(([name, on], index) => <div className="switch-row" key={name}><span>{name}</span><button aria-label={`${name} ${on ? '끄기' : '켜기'}`} className={`switch ${on ? 'on' : ''}`} onClick={() => setSettings(settings.map((item, i) => i === index ? [item[0], !item[1]] : item))}><i /></button></div>)}<div className="delivery"><span>리포트 도착 시간</span><b>매일 오전 8:00</b></div></article>;
}

function ReportNotifications() {
  return <div className="page enter"><PageHeader title="리포트 알림" description="매일 받아볼 투자 리포트의 내용과 알림 시간을 설정해요." /><section className="grid"><article className="card span-8"><div className="card-head"><div><h3>오늘의 투자 리포트</h3><p className="subtext">선택한 항목을 Luka가 매일 짧게 정리해 드려요.</p></div><span className="chip blue">미리보기</span></div><div className="report-sections"><Summary icon="↗" label="시장 흐름" title="위험선호는 중립이에요" body="대형 기술주는 상대적으로 강하지만 성장주의 변동성이 커지고 있어요."/><Summary icon="▦" label="연준 / 금리" title="주요 지표 발표 전 경계 구간" body="금리 기대가 다시 흔들릴 수 있어 신규 위험 노출을 줄였어요."/><Summary icon="◎" label="보유종목" title="SMR 공시 이벤트를 우선 감시" body="신규 발행 가능성과 계약 모멘텀을 함께 추적하고 있어요."/></div></article><ReportSettings /></section></div>;
}

type JournalRow = { date: string; stock: string; sector: string; period: string; buy: string; qty: string; memo: string };

const defaultJournalRows: JournalRow[] = [
  { date: '2026-09-14', stock: '삼성전자', sector: '반도체', period: '3년', buy: '75,000', qty: '600', memo: '매수 단가와 수량은 가상 값입니다.' },
  { date: '2026-08-20', stock: 'SK하이닉스', sector: '반도체', period: '1년', buy: '200,000', qty: '100', memo: 'AI 반도체 공급망 수요 확인' },
];

function Journal() {
  const [term, setTerm] = useState('장기');
  const [rows, setRows] = useState<JournalRow[]>(() => {
    try { return JSON.parse(localStorage.getItem('luka-investment-journal') || 'null') || defaultJournalRows; }
    catch { return defaultJournalRows; }
  });
  useEffect(() => { localStorage.setItem('luka-investment-journal', JSON.stringify(rows)); }, [rows]);
  const addRow = () => setRows([...rows, { date: '2026-09-30', stock: '', sector: '로봇', period: term === '장기' ? '3년' : term === '중기' ? '1년' : '4주', buy: '', qty: '', memo: '' }]);
  const updateRow = (index: number, key: keyof JournalRow, value: string) => setRows(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const total = rows.reduce((sum, row) => sum + (Number(row.buy.replaceAll(',', '')) || 0) * (Number(row.qty) || 0), 0);
  return <div className="page enter journal-page"><PageHeader title="투자 기록" description="생각부터 투자 내역까지, 셀에 바로 기록하세요." /><div className="journal-status">● 이 브라우저에 자동 저장됨</div><div className="journal-metrics"><Metric label={`${term} 투자 총액`} value={`${Math.round(total / 10000).toLocaleString()}만원`}/><Metric label="투자 기록" value={`${rows.length}건`}/><Metric label="최근 구매 날짜" value={rows[rows.length - 1]?.date || '—'}/></div><article className="card journal-sheet"><div className="sheet-toolbar"><div><b>투자 내역</b><span>/ 편집 가능한 시트</span></div><div className="sheet-actions"><button>현재 탭 CSV</button><button className="primary-button" onClick={addRow}>＋ 행 추가</button></div></div><div className="journal-filters">{['장기', '중기', '단기'].map((item) => <button key={item} className={term === item ? 'active' : ''} onClick={() => setTerm(item)}>{item}<span>{item === term ? rows.length : 0}</span></button>)}<select><option>전체 섹터</option><option>로봇</option><option>반도체</option><option>전력 인프라</option></select></div><div className="formula-bar"><span>A1</span><b>fx</b><input placeholder="셀을 선택해 내용을 편집하세요" /></div><div className="sheet-scroll"><table><thead><tr><th>#</th><th>구매일</th><th>종목</th><th>섹터</th><th>투자기간</th><th>매수가</th><th>수량</th><th>투자 메모</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{index + 1}</td>{(['date', 'stock', 'sector', 'period', 'buy', 'qty', 'memo'] as (keyof JournalRow)[]).map((key) => <td key={key}><input value={row[key]} placeholder="입력" onChange={(e) => updateRow(index, key, e.target.value)} /></td>)}</tr>)}</tbody></table></div><p className="sheet-help">입력 내용은 브라우저의 로컬 저장소에 자동 보관됩니다.</p></article></div>;
}

const sectorPlans = {
  robot: { name: '로봇', parts: '감속기·구동계 · 센서·제어 · 산업 자동화', title: '로봇의 확산, 부품과 자동화에서 찾기', thesis: '로봇 도입이 확대되면 핵심 부품과 산업 자동화 기업의 수요가 함께 성장할 것이다.', support: '양산 계약 · 실제 출하량 · 고객사 확대', risk: '도입 지연 또는 양산 계약 취소가 반복되는 경우' },
  semi: { name: '반도체', parts: '메모리 · 첨단 패키징 · 장비·소재', title: 'AI 반도체 성장, 공급망에서 찾기', thesis: 'AI 연산 수요가 확대되면 메모리와 첨단 패키징 등 관련 공급망 투자가 이어질 것이다.', support: '고객 주문 · 설비 가동률 · 이익률', risk: '주문 감소 또는 공급 과잉이 반복 확인되는 경우' },
  power: { name: '전력 인프라', parts: '전력 설비 · 전력 공급 · 냉각 설비', title: 'AI 성장, 전력 인프라에서 찾기', thesis: '데이터센터의 전력 수요가 늘면 전력망과 전력 설비 투자가 장기적으로 확대될 것이다.', support: '실제 수주 · 설비 투자 집행 · 이익 전환', risk: '주요 투자 취소 또는 수요 둔화가 반복되는 경우' },
};

function InvestmentPlan() {
  const [sector, setSector] = useState<keyof typeof sectorPlans>('robot');
  const [term, setTerm] = useState('단기');
  const [view, setView] = useState('실행 계획');
  const [memo, setMemo] = useState('');
  const current = sectorPlans[sector];
  return <div className="page enter"><PageHeader title="투자 플랜" description="내 생각과 시장을 연결하는 공간." /><section className="sector-picker"><span>관심 섹터</span>{Object.entries(sectorPlans).map(([key, item]) => <button key={key} className={sector === key ? 'active' : ''} onClick={() => setSector(key as keyof typeof sectorPlans)}><b>{item.name}</b><small>{item.parts}</small></button>)}</section><section className="plan-layout"><aside className="plan-side"><p>SECTOR INVESTMENT PLAN</p>{['장기', '중기', '단기'].map((item) => <button key={item} className={term === item ? 'active' : ''} onClick={() => setTerm(item)}><b>{item} · {current.name}</b><small>{item === '장기' ? '3–5년 · 큰 방향과 가설' : item === '중기' ? '6–12개월 · 실행과 검증' : '수일–4주 · 조건과 이벤트'}</small></button>)}</aside><article className="card plan-content"><p className="eyebrow">{current.name} / {term} · {term === '장기' ? '3–5년' : term === '중기' ? '6–12개월' : '수일–4주'}</p><h2>{current.title}</h2><p className="subtext">섹터 → 투자 계획 → 종목 → 뉴스와 근거</p><div className="plan-thesis"><div className="card-head"><h3>이번 {term} 전략의 원칙</h3><span className="chip green">v1 · 합의된 계획</span></div><p>{current.thesis}</p><div><section><b>계속 확인할 근거</b><span>{current.support}</span></section><section><b>생각을 바꿀 조건</b><span>{current.risk}</span></section></div></div><div className="memo-panel"><div className="card-head"><h3>{term} 전략 메모</h3><span className="chip">{current.name} · {term}</span></div><p>내 생각 · 판단 근거 · 다음에 확인할 것</p><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={'진입 이유:\n진입·청산 조건:\n보유 기한:\n다음 확인:'}/><div><small>{memo ? '저장하지 않은 변경이 있어요.' : '아직 작성한 메모가 없습니다.'}</small><button className="primary-button">메모 저장</button></div></div><div className="plan-tabs">{['검토할 뉴스 · 2', '연결 종목 · 3', '실행 계획'].map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item}</button>)}</div><div className="roadmap"><h3>{current.name} · {view}</h3>{view.startsWith('검토') ? <><PlanStep label="가설 지지" body={`${current.name} 산업의 신규 투자 확대 계획 발표`}/><PlanStep label="반대 근거" body="일부 프로젝트의 양산 전환 일정 지연"/></> : view.startsWith('연결') ? <><PlanStep label="종목 A" body={current.parts.split(' · ')[0]}/><PlanStep label="종목 B" body={current.parts.split(' · ')[1]}/><PlanStep label="종목 C" body={current.parts.split(' · ')[2]}/></> : <><PlanStep label="장기 · 3–5년" body={current.thesis}/><PlanStep label="중기 · 6–12개월" body="주문 증가가 출하량과 이익률 개선으로 이어지는지 확인한다."/><PlanStep label="다음 검토" body={current.support}/></>}</div></article></section></div>;
}

function PlanStep({ label, body }: { label: string; body: string }) {
  return <div className="plan-step"><span>{label}</span><p>{body}</p></div>;
}

function Alerts() {
  const initial = [{ title: '가격 화면 최소화', desc: '일중 시세 대신 하루 1회 요약', on: true }, { title: '위험 알림만 받기', desc: '손실·공시·매크로 급변 시에만', on: true }, { title: '주간 정기 리포트', desc: '매주 일요일 한 번 요약', on: true }, { title: '이벤트 데이 알림', desc: 'CPI · FOMC · 실적 발표', on: false }];
  const [items, setItems] = useState(initial);
  return <div className="page enter"><PageHeader title="알림 전략" description="가격은 덜 보고, 정말 중요한 변화가 생길 때만 알려드려요." /><section className="grid"><article className="card span-7 settings-card"><h3>안 보는 투자 설정</h3><p className="subtext">필요한 알림만 남겨 두면 Luka가 대신 지켜봐요.</p>{items.map((item, index) => <div className="switch-row alert-row" key={item.title}><div><b>{item.title}</b><span>{item.desc}</span></div><button className={`switch ${item.on ? 'on' : ''}`} onClick={() => setItems(items.map((value, i) => i === index ? { ...value, on: !value.on } : value))}><i /></button></div>)}</article><article className="card span-5 habit-card"><p className="eyebrow">이번 주 확인 습관</p><h2>-61%</h2><p>지난 7일 동안 앱 확인 빈도가 줄었어요.</p><div className="habit-ring"><div><b>11회</b><span>앱 확인</span></div></div><div className="habit-stats"><div><b>3건</b><span>위험 알림</span></div><div><b>4회</b><span>불필요 확인</span></div></div></article></section></div>;
}

function DetailModal({ info, close }: { info: NonNullable<ModalInfo>; close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className="modal"><div className="modal-handle"/><button className="modal-close" onClick={close}>×</button><span className="modal-kicker">LUKA INSIGHT</span><h2>{info.title}</h2><p>{info.body}</p><div className="confidence"><div><span>AI 판단 신뢰도</span><b>72%</b></div><i><span /></i></div><div className="source-note">근거 데이터 · 최근 거래 · 위험 지표 · 뉴스와 공시를 함께 분석한 샘플 결과예요.</div><button className="primary-button full" onClick={close}>확인했어요</button></div></div>;
}
