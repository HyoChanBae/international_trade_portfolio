import { useEffect, useMemo, useState } from 'react';
import { readHmrcTradeSnapshot, type HmrcTradeRow } from '../lib/snowflakeApi';

type Company = 'INEOS Energy' | 'Millennium Management' | 'RocketFin';
type TradeItem = {
  company: Company;
  category: string;
  hs2: string;
  hs4: string;
  hs6: string;
  commodity: string;
  purpose: string;
};

const tradeItems: TradeItem[] = [
  { company: 'INEOS Energy', category: '원유', hs2: '27', hs4: '2709', hs6: '270900', commodity: '원유', purpose: '원유 수입 의존도' },
  { company: 'INEOS Energy', category: '천연가스', hs2: '27', hs4: '2711', hs6: '271111', commodity: 'LNG', purpose: '액화천연가스 수입 변화' },
  { company: 'INEOS Energy', category: '천연가스', hs2: '27', hs4: '2711', hs6: '271121', commodity: '기체 천연가스', purpose: '파이프라인 가스 공급 구조' },
  { company: 'INEOS Energy', category: 'LPG', hs2: '27', hs4: '2711', hs6: '271112', commodity: '액화 프로판', purpose: '에너지·석유화학 원료' },
  { company: 'INEOS Energy', category: 'LPG', hs2: '27', hs4: '2711', hs6: '271113', commodity: '액화 부탄', purpose: '석유화학 원료 공급' },
  { company: 'INEOS Energy', category: '석유화학', hs2: '29', hs4: '2901', hs6: '290121', commodity: '에틸렌', purpose: '화학 원료 교역' },
  { company: 'INEOS Energy', category: '석유화학', hs2: '29', hs4: '2901', hs6: '290122', commodity: '프로필렌', purpose: '화학제품 공급망' },
  { company: 'INEOS Energy', category: '석유화학', hs2: '29', hs4: '2902', hs6: '290220', commodity: '벤젠', purpose: '기초 화학원료' },
  { company: 'INEOS Energy', category: '플라스틱', hs2: '39', hs4: '3901', hs6: '390110', commodity: '폴리에틸렌', purpose: '다운스트림 수요' },
  { company: 'INEOS Energy', category: '플라스틱', hs2: '39', hs4: '3902', hs6: '390210', commodity: '폴리프로필렌', purpose: '산업별 소재 수요' },
  { company: 'INEOS Energy', category: '산업설비', hs2: '84', hs4: '8411', hs6: '841182', commodity: '가스터빈', purpose: '에너지 설비 무역' },
  { company: 'Millennium Management', category: '구리', hs2: '74', hs4: '7403', hs6: '740311', commodity: '정제 구리 음극', purpose: '산업 금속 수요 신호' },
  { company: 'Millennium Management', category: '구리', hs2: '74', hs4: '7408', hs6: '740811', commodity: '정제 구리선', purpose: '전력·전선 산업' },
  { company: 'Millennium Management', category: '알루미늄', hs2: '76', hs4: '7601', hs6: '760110', commodity: '비합금 알루미늄', purpose: '제조업 수요' },
  { company: 'Millennium Management', category: '니켈', hs2: '75', hs4: '7502', hs6: '750210', commodity: '비합금 니켈', purpose: '배터리·합금 공급' },
  { company: 'Millennium Management', category: '철강', hs2: '72', hs4: '7208', hs6: '720839', commodity: '열연강판', purpose: '산업 경기' },
  { company: 'Millennium Management', category: '철강', hs2: '72', hs4: '7209', hs6: '720917', commodity: '냉연강판', purpose: '자동차·제조업' },
  { company: 'Millennium Management', category: '반도체', hs2: '85', hs4: '8542', hs6: '854231', commodity: '프로세서·컨트롤러', purpose: '반도체 공급망' },
  { company: 'Millennium Management', category: '반도체', hs2: '85', hs4: '8542', hs6: '854232', commodity: '메모리 반도체', purpose: '메모리 산업' },
  { company: 'Millennium Management', category: '반도체', hs2: '85', hs4: '8541', hs6: '854141', commodity: 'LED', purpose: '광전자 산업' },
  { company: 'Millennium Management', category: '전기차', hs2: '87', hs4: '8703', hs6: '870380', commodity: '순수 전기 승용차', purpose: 'EV 무역 변화' },
  { company: 'Millennium Management', category: '배터리', hs2: '85', hs4: '8507', hs6: '850760', commodity: '리튬이온 배터리', purpose: '에너지저장 산업' },
  { company: 'Millennium Management', category: '곡물', hs2: '10', hs4: '1001', hs6: '100199', commodity: '기타 밀·메슬린', purpose: '농산물 무역 모멘텀' },
  { company: 'Millennium Management', category: '커피', hs2: '09', hs4: '0901', hs6: '090111', commodity: '비볶음 커피', purpose: '소비재 원자재 흐름' },
  { company: 'RocketFin', category: '에너지 트레이딩', hs2: '27', hs4: '2709', hs6: '270900', commodity: '원유', purpose: '원자재 무역 노출' },
  { company: 'RocketFin', category: '가스 트레이딩', hs2: '27', hs4: '2711', hs6: '271111', commodity: 'LNG', purpose: 'LNG 공급 충격 분석' },
  { company: 'RocketFin', category: '가스 트레이딩', hs2: '27', hs4: '2711', hs6: '271121', commodity: '천연가스', purpose: '가스 공급 구조' },
  { company: 'RocketFin', category: '비철금속', hs2: '74', hs4: '7403', hs6: '740311', commodity: '정제 구리', purpose: '구리 가격 위험 관련 지표' },
  { company: 'RocketFin', category: '비철금속', hs2: '76', hs4: '7601', hs6: '760110', commodity: '알루미늄', purpose: '산업 금속 노출' },
  { company: 'RocketFin', category: '비철금속', hs2: '75', hs4: '7502', hs6: '750210', commodity: '니켈', purpose: '금속 시장 리스크' },
  { company: 'RocketFin', category: '귀금속', hs2: '71', hs4: '7108', hs6: '710812', commodity: '비화폐용 금', purpose: '귀금속 무역 흐름' },
  { company: 'RocketFin', category: '귀금속', hs2: '71', hs4: '7106', hs6: '710691', commodity: '미가공 은', purpose: '귀금속 무역 흐름' },
  { company: 'RocketFin', category: '전기차', hs2: '87', hs4: '8703', hs6: '870380', commodity: '전기 승용차', purpose: '산업별 무역 노출' },
  { company: 'RocketFin', category: '배터리', hs2: '85', hs4: '8507', hs6: '850760', commodity: '리튬이온 배터리', purpose: '공급망 집중도' },
  { company: 'RocketFin', category: '곡물', hs2: '10', hs4: '1001', hs6: '100199', commodity: '밀·메슬린', purpose: '농산물 시장 위험' },
  { company: 'RocketFin', category: '철강', hs2: '72', hs4: '7208', hs6: '720839', commodity: '열연강판', purpose: '산업 무역 변화' },
];

const demoMonths = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const demoMass = [100, 108, 103, 112, 118, 125];
const demoValue = [100, 98, 105, 108, 105, 112];

const labels: Record<string, string> = {
  '원유': 'Crude Oil', '천연가스': 'Natural Gas', 'LPG': 'LPG', '석유화학': 'Petrochemicals',
  '플라스틱': 'Plastics', '산업설비': 'Industrial Equipment', '구리': 'Copper', '알루미늄': 'Aluminium',
  '니켈': 'Nickel', '철강': 'Steel', '반도체': 'Semiconductors', '전기차': 'Electric Vehicles',
  '배터리': 'Batteries', '곡물': 'Grains', '커피': 'Coffee', '에너지 트레이딩': 'Energy Trading',
  '가스 트레이딩': 'Gas Trading', '비철금속': 'Non-ferrous Metals', '귀금속': 'Precious Metals',
  '기체 천연가스': 'Gaseous natural gas', '액화 프로판': 'Liquefied propane', '액화 부탄': 'Liquefied butane',
  '에틸렌': 'Ethylene', '프로필렌': 'Propylene', '벤젠': 'Benzene', '폴리에틸렌': 'Polyethylene',
  '폴리프로필렌': 'Polypropylene', '가스터빈': 'Gas turbines', '정제 구리 음극': 'Refined copper cathodes',
  '정제 구리선': 'Refined copper wire', '비합금 알루미늄': 'Unwrought aluminium', '비합금 니켈': 'Unwrought nickel',
  '열연강판': 'Hot-rolled steel', '냉연강판': 'Cold-rolled steel', '프로세서·컨트롤러': 'Processors and controllers',
  '메모리 반도체': 'Memory semiconductors', '순수 전기 승용차': 'Battery electric cars',
  '리튬이온 배터리': 'Lithium-ion batteries', '기타 밀·메슬린': 'Wheat and meslin',
  '비볶음 커피': 'Unroasted coffee', '정제 구리': 'Refined copper', '비화폐용 금': 'Non-monetary gold',
  '미가공 은': 'Unwrought silver', '전기 승용차': 'Electric passenger cars', '밀·메슬린': 'Wheat and meslin',
  '원유 수입 의존도': 'Crude oil import dependency', '액화천연가스 수입 변화': 'LNG import trends',
  '파이프라인 가스 공급 구조': 'Pipeline gas supply structure', '에너지·석유화학 원료': 'Energy and petrochemical feedstock',
  '석유화학 원료 공급': 'Petrochemical feedstock supply', '화학 원료 교역': 'Chemical feedstock trade',
  '화학제품 공급망': 'Chemical supply chain', '기초 화학원료': 'Basic chemical feedstocks',
  '다운스트림 수요': 'Downstream demand', '산업별 소재 수요': 'Industrial materials demand',
  '에너지 설비 무역': 'Energy equipment trade', '산업 금속 수요 신호': 'Industrial metals demand signal',
  '전력·전선 산업': 'Power and cable industry', '제조업 수요': 'Manufacturing demand',
  '배터리·합금 공급': 'Battery and alloy supply', '산업 경기': 'Industrial cycle',
  '자동차·제조업': 'Automotive and manufacturing', '반도체 공급망': 'Semiconductor supply chain',
  '메모리 산업': 'Memory industry', '광전자 산업': 'Optoelectronics industry', 'EV 무역 변화': 'EV trade trends',
  '에너지저장 산업': 'Energy storage industry', '농산물 무역 모멘텀': 'Agricultural trade momentum',
  '소비재 원자재 흐름': 'Consumer commodity flows', '원자재 무역 노출': 'Commodity trade exposure',
  'LNG 공급 충격 분석': 'LNG supply shock analysis', '가스 공급 구조': 'Gas supply structure',
  '구리 가격 위험 관련 지표': 'Copper price risk indicator', '산업 금속 노출': 'Industrial metals exposure',
  '금속 시장 리스크': 'Metals market risk', '귀금속 무역 흐름': 'Precious metals trade flows',
  '산업별 무역 노출': 'Sector trade exposure', '공급망 집중도': 'Supply-chain concentration',
  '농산물 시장 위험': 'Agricultural market risk', '산업 무역 변화': 'Industrial trade trends',
};

type Language = 'en' | 'ko';

const UI_TEXT = {
  en: {
    title: 'UK Commodity Demand Monitor', subtitle: 'Turn UK import flows into company-specific investment signals.', connecting: 'CONNECTING', sample: 'SAMPLE DATA',
    company: 'Company', commodity: 'Commodity', hsCode: 'HS Code', objective: 'Investment Objective',
    allCompanies: 'All companies', allCommodities: 'All commodities', allHsCodes: 'All HS codes', allObjectives: 'All investment objectives',
    unavailable: 'Snowflake is unavailable, so sample indices are shown.', selectedScope: 'Selected scope', allCompanyScope: 'All 3 companies',
    itemUnit: 'investment items', codeUnit: 'HS6 codes', importVolume: 'Import volume', importValue: 'Import value', unitPrice: 'Estimated unit price',
    volumeIndex: 'Import volume index', valueIndex: 'Import value index', chartAria: 'Monthly import volume and value indices',
    index: 'Index',
    liveCaption: 'HMRC monthly import indices', sampleCaption: 'Illustrative sample data · Not an actual HMRC aggregate',
    investmentItems: 'Investment Items', tableDescription: 'HS2 → HS4 → HS6 classifications linked to company-specific investment theses',
    items: 'items', product: 'Product', waiting: 'Awaiting YoY comparison', setTo: 'set to 100',
  },
  ko: {
    title: '영국 상품 수요 모니터', subtitle: '영국 수입 흐름을 기업 관점의 투자 시그널로 바꿔 확인합니다.', connecting: '연결 중', sample: '예시 데이터',
    company: '회사', commodity: '상품군', hsCode: 'HS 코드', objective: '투자 분석 목적',
    allCompanies: '전체 회사', allCommodities: '전체 상품군', allHsCodes: '전체 HS 코드', allObjectives: '전체 분석 목적',
    unavailable: 'Snowflake 응답을 받지 못해 예시 지수를 표시합니다.', selectedScope: '선택 범위', allCompanyScope: '3개 회사 통합',
    itemUnit: '개 분석 항목', codeUnit: '개 HS6 코드', importVolume: '수입량', importValue: '수입 금액', unitPrice: '추정 단가',
    volumeIndex: '수입량 지수', valueIndex: '수입금액 지수', chartAria: '월별 수입량 및 수입금액 지수',
    index: '지수',
    liveCaption: 'HMRC 월별 수입 지수', sampleCaption: '설명용 가상 데이터 · 실제 HMRC 집계 결과 아님',
    investmentItems: '분석 아이템', tableDescription: '회사별 투자 가설과 연결된 HS2 → HS4 → HS6 분류',
    items: '개 항목', product: '품목', waiting: 'YoY 비교 대기', setTo: '을 100으로 설정',
  },
} as const;

const labelOf = (value: string, language: Language) => language === 'ko' ? value : labels[value] ?? value;
const ALL_COMPANIES = 'All companies';
const ALL_COMMODITIES = 'All commodities';
const ALL_HS_CODES = 'All HS codes';
const ALL_PURPOSES = 'All investment objectives';

const valueOf = (row: HmrcTradeRow, key: keyof HmrcTradeRow) => Number(row[key] ?? 0) || 0;
const textOf = (row: HmrcTradeRow, key: keyof HmrcTradeRow) => String(row[key] ?? '').trim();
const selectValues = (items: TradeItem[], key: keyof TradeItem) => [...new Set(items.map((item) => item[key]))].sort((a, b) => a.localeCompare(b, 'ko'));
const formatMonth = (month: string, language: Language) => {
  const raw = month.replace(/[^0-9]/g, '');
  if (raw.length < 6) return month;
  if (language === 'ko') return `${Number(raw.slice(4, 6))}월`;
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(2000, Number(raw.slice(4, 6)) - 1, 1));
};
const compact = (value: number, currency = false) => {
  if (currency) {
    if (value >= 1e9) return `£${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `£${(value / 1e6).toFixed(1)}M`;
    return `£${Math.round(value).toLocaleString()}`;
  }
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M t`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K t`;
  return `${value.toFixed(1)} t`;
};

function TradeLineChart({ months, mass, value, rawMass, rawValue, language }: {
  months: string[];
  mass: number[];
  value: number[];
  rawMass?: number[];
  rawValue?: number[];
  language: Language;
}) {
  const ui = UI_TEXT[language];
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 840;
  const height = 300;
  const pad = { left: 48, right: 16, top: 22, bottom: 42 };
  const all = [...mass, ...value];
  const min = Math.floor((Math.min(...all, 85) - 5) / 5) * 5;
  const max = Math.ceil((Math.max(...all, 115) + 5) / 5) * 5;
  const x = (index: number) => pad.left + (index * (width - pad.left - pad.right)) / Math.max(months.length - 1, 1);
  const y = (point: number) => pad.top + ((max - point) * (height - pad.top - pad.bottom)) / Math.max(max - min, 1);
  const points = (values: number[]) => values.map((point, index) => `${x(index)},${y(point)}`).join(' ');
  const ticks = Array.from({ length: 4 }, (_, i) => Math.round(min + ((max - min) * i) / 3)).reverse();
  const hoveredTop = hovered == null ? 0 : Math.min(y(mass[hovered]), y(value[hovered]));
  return (
    <div className="hmrc-chart-wrap">
      <div className="hmrc-chart-stage">
        <svg className="hmrc-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ui.chartAria} onMouseLeave={() => setHovered(null)}>
          {ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} /><text x={pad.left - 10} y={y(tick) + 4}>{tick}</text></g>)}
          {hovered != null && <line className="hmrc-hover-guide" x1={x(hovered)} x2={x(hovered)} y1={pad.top} y2={height - pad.bottom} />}
          <polyline className="hmrc-line mass" points={points(mass)} />
          <polyline className="hmrc-line value" points={points(value)} />
          {mass.map((point, index) => <circle className={`hmrc-dot mass ${hovered === index ? 'active' : ''}`} key={`m${months[index]}`} cx={x(index)} cy={y(point)} r={hovered === index ? 6 : 4} />)}
          {value.map((point, index) => <circle className={`hmrc-dot value ${hovered === index ? 'active' : ''}`} key={`v${months[index]}`} cx={x(index)} cy={y(point)} r={hovered === index ? 6 : 4} />)}
          {months.map((month, index) => <text className="hmrc-month" key={month} x={x(index)} y={height - 12}>{formatMonth(month, language)}</text>)}
          {months.map((month, index) => {
            const left = index === 0 ? pad.left : (x(index - 1) + x(index)) / 2;
            const right = index === months.length - 1 ? width - pad.right : (x(index) + x(index + 1)) / 2;
            return <rect key={`hit-${month}`} className="hmrc-hover-zone" x={left} y={pad.top} width={right - left} height={height - pad.top - pad.bottom} onMouseEnter={() => setHovered(index)} onPointerDown={() => setHovered(index)} />;
          })}
        </svg>
        {hovered != null && <div className={`hmrc-chart-tooltip ${hovered === 0 ? 'edge-left' : hovered === months.length - 1 ? 'edge-right' : ''}`} style={{ left: `${(x(hovered) / width) * 100}%`, top: `${Math.max(3, (hoveredTop / height) * 100 - 3)}%` }} role="status">
          <b>{formatMonth(months[hovered], language)}</b>
          <div><span><i className="mass" />{rawMass ? ui.importVolume : ui.volumeIndex}</span><strong>{rawMass ? compact(rawMass[hovered]) : mass[hovered].toFixed(1)}</strong>{rawMass && <small>{ui.index} {mass[hovered].toFixed(1)}</small>}</div>
          <div><span><i className="value" />{rawValue ? ui.importValue : ui.valueIndex}</span><strong>{rawValue ? compact(rawValue[hovered], true) : value[hovered].toFixed(1)}</strong>{rawValue && <small>{ui.index} {value[hovered].toFixed(1)}</small>}</div>
        </div>}
      </div>
      <div className="hmrc-legend"><span><i className="mass" />{ui.volumeIndex}</span><span><i className="value" />{ui.valueIndex}</span></div>
    </div>
  );
}

export function HmrcTradeMonitor() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('hmrc-language') === 'ko' ? 'ko' : 'en');
  const [company, setCompany] = useState(ALL_COMPANIES);
  const [category, setCategory] = useState(ALL_COMMODITIES);
  const [hsCode, setHsCode] = useState(ALL_HS_CODES);
  const [purpose, setPurpose] = useState(ALL_PURPOSES);
  const [rows, setRows] = useState<HmrcTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const ui = UI_TEXT[language];

  useEffect(() => {
    readHmrcTradeSnapshot().then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load HMRC data.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    localStorage.setItem('hmrc-language', language);
    document.documentElement.lang = language;
  }, [language]);

  const companyItems = useMemo(() => company === ALL_COMPANIES ? tradeItems : tradeItems.filter((item) => item.company === company), [company]);
  const filtered = useMemo(() => tradeItems.filter((item) =>
    (company === ALL_COMPANIES || item.company === company)
    && (category === ALL_COMMODITIES || item.category === category)
    && (hsCode === ALL_HS_CODES || item.hs6 === hsCode)
    && (purpose === ALL_PURPOSES || item.purpose === purpose)), [company, category, hsCode, purpose]);
  const selectedCodes = useMemo(() => new Set(filtered.map((item) => item.hs6)), [filtered]);
  const importedRows = useMemo(() => {
    const selected = rows.filter((row) => selectedCodes.has(textOf(row, 'HS6CODE')));
    const imports = selected.filter((row) => /import/i.test(textOf(row, 'FLOW_DESCRIPTION')));
    return imports.length ? imports : selected;
  }, [rows, selectedCodes]);
  const monthly = useMemo(() => {
    const grouped = new Map<string, { value: number; mass: number }>();
    importedRows.forEach((row) => {
      const month = textOf(row, 'MONTH_ID');
      const current = grouped.get(month) ?? { value: 0, mass: 0 };
      current.value += valueOf(row, 'TRADE_VALUE');
      current.mass += valueOf(row, 'NET_MASS');
      grouped.set(month, current);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-13).map(([month, data]) => ({ month, ...data }));
  }, [importedRows]);
  const latestMonths = monthly.slice(-6);
  const hasLive = latestMonths.length >= 2;
  const chartMonths = hasLive ? latestMonths.map((item) => item.month) : demoMonths;
  const normalize = (values: number[]) => values.map((value) => values[0] ? Math.round((value / values[0]) * 1000) / 10 : 0);
  const massIndex = hasLive ? normalize(latestMonths.map((item) => item.mass)) : demoMass;
  const valueIndex = hasLive ? normalize(latestMonths.map((item) => item.value)) : demoValue;
  const chartMassTonnes = hasLive ? latestMonths.map((item) => item.mass / 1000) : undefined;
  const chartTradeValues = hasLive ? latestMonths.map((item) => item.value) : undefined;
  const latest = monthly.at(-1);
  const previousYear = monthly.length >= 13 ? monthly.at(-13) : undefined;
  const yoy = (now = 0, before = 0) => before ? ((now - before) / before) * 100 : null;
  const massTonnes = (latest?.mass ?? 1_240_000_000) / 1000;
  const tradeValue = latest?.value ?? 842_000_000;
  const unitPrice = massTonnes ? tradeValue / massTonnes : 0;

  const resetDependent = () => { setCategory(ALL_COMMODITIES); setHsCode(ALL_HS_CODES); setPurpose(ALL_PURPOSES); };
  return (
    <div className="page enter hmrc-page">
      <div className="page-header hmrc-heading">
        <div><p className="hello">HMRC · UK TRADE INFO</p><h1>{ui.title}</h1><p className="page-description">{ui.subtitle}</p></div>
        <div className="hmrc-header-actions">
          <span className={`market-badge ${hasLive ? '' : 'hmrc-demo-badge'}`}><i />{loading ? ui.connecting : hasLive ? 'SNOWFLAKE LIVE' : ui.sample}</span>
          <fieldset className="hmrc-language-toggle" aria-label="Language">
            <legend>Language</legend>
            <label className={language === 'en' ? 'active' : ''}><input type="radio" name="hmrc-language" value="en" checked={language === 'en'} onChange={() => setLanguage('en')} />ENG</label>
            <label className={language === 'ko' ? 'active' : ''}><input type="radio" name="hmrc-language" value="ko" checked={language === 'ko'} onChange={() => setLanguage('ko')} />KOR</label>
          </fieldset>
        </div>
      </div>

      <section className="hmrc-filter-card" aria-label={language === 'ko' ? 'HMRC 데이터 필터' : 'HMRC data filters'}>
        <label><span>{ui.company}</span><select value={company} onChange={(event) => { setCompany(event.target.value); resetDependent(); }}><option value={ALL_COMPANIES}>{ui.allCompanies}</option>{selectValues(tradeItems, 'company').map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>{ui.commodity}</span><select value={category} onChange={(event) => { setCategory(event.target.value); setHsCode(ALL_HS_CODES); setPurpose(ALL_PURPOSES); }}><option value={ALL_COMMODITIES}>{ui.allCommodities}</option>{selectValues(companyItems, 'category').map((item) => <option key={item} value={item}>{labelOf(item, language)}</option>)}</select></label>
        <label><span>{ui.hsCode}</span><select value={hsCode} onChange={(event) => setHsCode(event.target.value)}><option value={ALL_HS_CODES}>{ui.allHsCodes}</option>{[...new Set(companyItems.filter((item) => category === ALL_COMMODITIES || item.category === category).map((item) => item.hs6))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>{ui.objective}</span><select value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value={ALL_PURPOSES}>{ui.allObjectives}</option>{selectValues(companyItems, 'purpose').map((item) => <option key={item} value={item}>{labelOf(item, language)}</option>)}</select></label>
      </section>

      {error && <div className="hmrc-data-note">{ui.unavailable} <span>{error}</span></div>}
      <article className="card hmrc-monitor-card">
        <div className="hmrc-card-top"><div><span>{ui.selectedScope}</span><strong>{company === ALL_COMPANIES ? ui.allCompanyScope : company}</strong><small>{language === 'ko' ? `${filtered.length}${ui.itemUnit} · ${selectedCodes.size}${ui.codeUnit}` : `${filtered.length} ${ui.itemUnit} · ${selectedCodes.size} ${ui.codeUnit}`}</small></div><span className="hmrc-source">UKTI_OTS</span></div>
        <div className="hmrc-metrics">
          <Metric label={ui.importVolume} value={compact(massTonnes)} change={yoy(latest?.mass, previousYear?.mass)} waiting={ui.waiting} />
          <Metric label={ui.importValue} value={compact(tradeValue, true)} change={yoy(latest?.value, previousYear?.value)} waiting={ui.waiting} />
          <Metric label={ui.unitPrice} value={`£${Math.round(unitPrice).toLocaleString('en-GB')}/t`} change={previousYear ? yoy(unitPrice, (previousYear.value / (previousYear.mass / 1000 || 1))) : null} waiting={ui.waiting} />
        </div>
        <TradeLineChart months={chartMonths} mass={massIndex} value={valueIndex} rawMass={chartMassTonnes} rawValue={chartTradeValues} language={language} />
        <p className="hmrc-caption">{hasLive ? `${ui.liveCaption} · ${formatMonth(chartMonths[0], language)} ${ui.setTo}` : ui.sampleCaption}</p>
      </article>

      <article className="card hmrc-table-card">
        <div className="card-head"><div><h3>{ui.investmentItems}</h3><p className="subtext">{ui.tableDescription}</p></div><span className="chip blue">{language === 'ko' ? `${filtered.length}${ui.items}` : `${filtered.length} ${ui.items}`}</span></div>
        <div className="hmrc-table-wrap"><table><thead><tr><th>{ui.company}</th><th>{ui.commodity}</th><th>HS2</th><th>HS4</th><th>HS6</th><th>{ui.product}</th><th>{ui.objective}</th></tr></thead><tbody>{filtered.map((item) => <tr key={`${item.company}-${item.hs6}-${item.purpose}`}><td><b>{item.company}</b></td><td><span className="hmrc-category">{labelOf(item.category, language)}</span></td><td>{item.hs2}</td><td>{item.hs4}</td><td><code>{item.hs6}</code></td><td>{labelOf(item.commodity, language)}</td><td>{labelOf(item.purpose, language)}</td></tr>)}</tbody></table></div>
      </article>
    </div>
  );
}

function Metric({ label, value, change, waiting }: { label: string; value: string; change: number | null; waiting: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small className={change == null ? '' : change >= 0 ? 'positive' : 'negative'}>{change == null ? waiting : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% YoY`}</small></div>;
}
