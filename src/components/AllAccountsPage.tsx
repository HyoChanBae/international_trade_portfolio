import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import {
  deleteAllHoldings,
  deleteHolding,
  fetchHoldings,
  saveHolding,
  type Holding,
} from '../lib/lukaApi';
import { snowflakeConfigured } from '../lib/snowflakeApi';
import { AccountBotManager } from './AccountBotManager';

type RegionFilter = 'ALL' | Holding['marketScope'];
type TermFilter = 'ALL' | Holding['investmentTerm'];
type RowStatus = 'new' | 'dirty' | 'saving' | 'saved' | 'error';
type NumericKey = 'quantity' | 'avgBuyPrice' | 'currentPrice' | 'exchangeRate';
type AccountRow = Omit<Holding, NumericKey> & Record<NumericKey, string> & {
  clientId: string;
  status: RowStatus;
};
type EditableKey = keyof Pick<Holding,
  'marketScope' | 'investmentTerm' | 'brokerName' | 'accountName' | 'stockName' |
  'currencyCode' | 'quantity' | 'avgBuyPrice' | 'currentPrice' |
  'exchangeRate' | 'memo'>;

let rowSequence = 0;
const nextClientId = () => `account-row-${Date.now()}-${rowSequence++}`;

const blankHolding = (): Holding => ({
  brokerName: '',
  accountName: '',
  accountType: 'GENERAL',
  marketScope: 'DOMESTIC',
  investmentTerm: 'LONG',
  shortCode: '',
  stockName: '',
  currencyCode: 'KRW',
  quantity: 0,
  avgBuyPrice: 0,
  currentPrice: 0,
  exchangeRate: 1,
  memo: '',
});

const toAccountRow = (row?: Holding, status: RowStatus = 'new'): AccountRow => {
  const source = row ?? blankHolding();
  const editableNumber = (value: number) => value === 0 ? '' : String(value);
  return {
    ...source,
    quantity: row ? editableNumber(source.quantity) : '',
    avgBuyPrice: row ? editableNumber(source.avgBuyPrice) : '',
    currentPrice: row ? editableNumber(source.currentPrice) : '',
    exchangeRate: String(source.exchangeRate || 1),
    clientId: nextClientId(),
    status,
  };
};

const errorMessage = (reason: unknown) => {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object') {
    const issue = reason as { code?: string; message?: string; details?: string; hint?: string };
    const field = issue.message?.match(/column "([^"]+)"/)?.[1];
    if (issue.code === '23502' && (field === 'holding_id' || field === 'account_id')) return `DB의 ${field} 자동 발급 설정이 필요합니다.`;
    if (issue.code === '23502') return `필수 저장값${field ? `(${field})` : ''}이 누락되었습니다.`;
    if (issue.code === '23505') return '같은 계좌에 동일한 투자 기간과 종목이 이미 등록되어 있습니다.';
    if (issue.code === '42501') return 'Snowflake 쓰기 권한이 없습니다. 역할과 테이블 권한을 확인해 주세요.';
    return [issue.message, issue.details, issue.hint].filter(Boolean).join(' · ') || '요청을 처리하지 못했습니다.';
  }
  return '요청을 처리하지 못했습니다.';
};
const numberValue = (value: unknown) => {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};
const numericDraftValue = (value: string) => value.replaceAll(',', '').trim();
const draftNumber = (value: string, fallback = 0) => {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const won = (value: number, signed = false) => {
  const rounded = Math.round(value);
  const sign = signed && rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('ko-KR')}원`;
};
const rowExchangeRate = (row: AccountRow) => row.marketScope === 'OVERSEAS' ? draftNumber(row.exchangeRate, 1) : 1;
const rowValue = (row: AccountRow) => draftNumber(row.quantity) * draftNumber(row.currentPrice) * rowExchangeRate(row);
const rowCost = (row: AccountRow) => draftNumber(row.quantity) * draftNumber(row.avgBuyPrice) * rowExchangeRate(row);

const fieldOrder: EditableKey[] = [
  'marketScope', 'investmentTerm', 'brokerName', 'accountName', 'stockName',
  'currencyCode', 'quantity', 'avgBuyPrice', 'currentPrice', 'exchangeRate', 'memo',
];

const importAliases: Record<EditableKey, string[]> = {
  marketScope: ['구분', '시장구분', '시장'],
  investmentTerm: ['투자 기간', '투자기간', '기간'],
  brokerName: ['증권사'],
  accountName: ['계좌명'],
  stockName: ['종목명'],
  currencyCode: ['통화'],
  quantity: ['수량'],
  avgBuyPrice: ['평균단가', '평단가'],
  currentPrice: ['현재가'],
  exchangeRate: ['환율'],
  memo: ['메모'],
};

function normaliseMarket(value: unknown): Holding['marketScope'] {
  const text = String(value ?? '').trim().toUpperCase();
  return text === '해외' || text === 'OVERSEAS' || text === 'US' ? 'OVERSEAS' : 'DOMESTIC';
}

function normaliseTerm(value: unknown): Holding['investmentTerm'] {
  const text = String(value ?? '').trim().toUpperCase();
  if (text === '중기' || text === 'MEDIUM' || text === 'MID') return 'MEDIUM';
  if (text === '단기' || text === 'SHORT') return 'SHORT';
  return 'LONG';
}

function importedRows(matrix: unknown[][]): Holding[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((cell) => String(cell ?? '').trim());
  const indexOf = (key: EditableKey) => headers.findIndex((header) => importAliases[key].includes(header));
  return matrix.slice(1).filter((cells) => cells.some((cell) => String(cell ?? '').trim())).map((cells) => {
    const read = (key: EditableKey) => {
      const index = indexOf(key);
      return index >= 0 ? cells[index] : '';
    };
    const marketScope = normaliseMarket(read('marketScope'));
    return {
      ...blankHolding(),
      marketScope,
      investmentTerm: normaliseTerm(read('investmentTerm')),
      brokerName: String(read('brokerName') ?? '').trim(),
      accountName: String(read('accountName') ?? '').trim(),
      shortCode: '',
      stockName: String(read('stockName') ?? '').trim(),
      currencyCode: String(read('currencyCode') || (marketScope === 'OVERSEAS' ? 'USD' : 'KRW')).trim().toUpperCase(),
      quantity: numberValue(read('quantity')),
      avgBuyPrice: numberValue(read('avgBuyPrice')),
      currentPrice: numberValue(read('currentPrice')),
      exchangeRate: numberValue(read('exchangeRate')) || 1,
      memo: String(read('memo') ?? '').trim(),
    };
  });
}

export function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(snowflakeConfigured);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [region, setRegion] = useState<RegionFilter>('ALL');
  const [term, setTerm] = useState<TermFilter>('ALL');
  const [mobileEditorIndex, setMobileEditorIndex] = useState<number | null>(null);
  const [accountRefreshKey, setAccountRefreshKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!snowflakeConfigured) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchHoldings();
      setRows(data.map((row) => toAccountRow(row, 'saved')));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    domestic: rows.filter((row) => row.marketScope === 'DOMESTIC').length,
    overseas: rows.filter((row) => row.marketScope === 'OVERSEAS').length,
  }), [rows]);

  const summary = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + rowValue(row), 0);
    const cost = rows.reduce((sum, row) => sum + rowCost(row), 0);
    const domestic = rows.filter((row) => row.marketScope === 'DOMESTIC').reduce((sum, row) => sum + rowValue(row), 0);
    const overseas = rows.filter((row) => row.marketScope === 'OVERSEAS').reduce((sum, row) => sum + rowValue(row), 0);
    const profit = total - cost;
    return { total, domestic, overseas, profit, rate: cost ? profit / cost * 100 : 0 };
  }, [rows]);

  const visibleRows = useMemo(() => rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => (region === 'ALL' || row.marketScope === region) && (term === 'ALL' || row.investmentTerm === term)),
  [rows, region, term]);

  const patchRow = (index: number, changes: Partial<AccountRow>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, ...changes, status: 'dirty' }
      : row));
  };

  const addRow = () => {
    const index = rows.length;
    setRows((current) => [...current, toAccountRow()]);
    setMobileEditorIndex(index);
  };

  const saveRow = async (index: number) => {
    const row = rows[index];
    if (!row || row.status === 'saving' || row.status === 'saved') return;
    if (!row.brokerName.trim() || !row.accountName.trim() || !row.stockName.trim()) {
      setRows((current) => current.map((item, i) => i === index ? { ...item, status: 'error' } : item));
      setError(`${index + 1}행: 증권사, 계좌명, 종목명을 입력해 주세요.`);
      return;
    }
    if (!row.quantity.trim() || !row.avgBuyPrice.trim()) {
      setRows((current) => current.map((item, i) => i === index ? { ...item, status: 'error' } : item));
      setError(`${index + 1}행: 수량과 평균단가를 입력해 주세요.`);
      return;
    }
    const numericValues = [row.quantity, row.avgBuyPrice, row.currentPrice, row.exchangeRate]
      .filter((value) => value.trim())
      .map(Number);
    if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
      setRows((current) => current.map((item, i) => i === index ? { ...item, status: 'error' } : item));
      setError(`${index + 1}행: 숫자 항목에는 0 이상의 올바른 숫자를 입력해 주세요.`);
      return;
    }
    const { clientId: _clientId, status: _status, ...draft } = row;
    const holding: Holding = {
      ...draft,
      quantity: draftNumber(row.quantity),
      avgBuyPrice: draftNumber(row.avgBuyPrice),
      currentPrice: draftNumber(row.currentPrice),
      exchangeRate: draftNumber(row.exchangeRate, 1),
    };
    setError('');
    setRows((current) => current.map((item, i) => i === index ? { ...item, status: 'saving' } : item));
    try {
      const holdingId = await saveHolding(holding);
      setRows((current) => current.map((item, i) => i === index ? { ...item, holdingId, status: 'saved' } : item));
      setAccountRefreshKey((current) => current + 1);
      setNotice(`${index + 1}행을 저장했습니다.`);
    } catch (reason) {
      setRows((current) => current.map((item, i) => i === index ? { ...item, status: 'error' } : item));
      setError(errorMessage(reason));
    }
  };

  const removeRow = async (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.holdingId && !window.confirm(`${row.stockName || row.shortCode} 보유 내역을 삭제할까요?`)) return;
    try {
      if (row.holdingId) await deleteHolding(row.holdingId);
      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
      setNotice('보유 종목을 삭제했습니다.');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const clearAll = async () => {
    if (!rows.length || !window.confirm('등록된 전체 계좌 보유 종목을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    setLoading(true);
    setError('');
    try {
      await deleteAllHoldings();
      setRows([]);
      setNotice('전체 보유 종목을 비웠습니다.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['구분', '투자 기간', '증권사', '계좌명', '종목명', '통화', '수량', '평균단가', '현재가', '환율', '메모'],
      ['국내', '장기', '키움증권', '국내주식', '삼성전자', 'KRW', 10, 70000, 72000, 1, ''],
      ['해외', '중기', '토스증권', '해외주식', 'NVIDIA', 'USD', 2, 120, 130, 1320, ''],
    ]);
    sheet['!cols'] = [8, 11, 13, 14, 16, 8, 10, 12, 12, 10, 22].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '전체 계좌');
    XLSX.writeFile(workbook, 'Luka_전체계좌_업로드양식.xlsx');
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('업로드 파일은 5MB 이하만 사용할 수 있습니다.');
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = importedRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }));
      if (!parsed.length) throw new Error('불러올 데이터가 없습니다. 양식의 헤더와 입력 행을 확인해 주세요.');
      for (const row of parsed) {
        if (!row.brokerName || !row.accountName || !row.stockName) {
          throw new Error('증권사, 계좌명 또는 종목명이 비어 있는 행이 있습니다.');
        }
        await saveHolding(row);
      }
      await load();
      setNotice(`${parsed.length}개 보유 종목을 불러와 저장했습니다.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      event.target.value = '';
      setLoading(false);
    }
  };

  const pasteCells = (event: ClipboardEvent<HTMLInputElement>, startIndex: number, startField: number) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n').filter(Boolean).map((line) => line.split('\t'));
    setRows((current) => {
      const next = current.map((row) => ({ ...row }));
      while (next.length < startIndex + matrix.length) next.push(toAccountRow());
      matrix.forEach((cells, rowOffset) => cells.forEach((cell, columnOffset) => {
        const key = fieldOrder[startField + columnOffset];
        if (!key) return;
        const target = next[startIndex + rowOffset];
        if (key === 'marketScope') target.marketScope = normaliseMarket(cell);
        else if (key === 'investmentTerm') target.investmentTerm = normaliseTerm(cell);
        else if (['quantity', 'avgBuyPrice', 'currentPrice', 'exchangeRate'].includes(key)) {
          (target as unknown as Record<string, unknown>)[key] = numericDraftValue(cell);
        } else {
          (target as unknown as Record<string, unknown>)[key] = cell.trim();
        }
        target.status = 'dirty';
      }));
      return next;
    });
    setNotice('붙여넣은 셀을 반영했습니다. 각 행을 저장해 주세요.');
  };

  return (
    <div className="page enter all-accounts-page">
      <div className="page-header">
        <div>
          <h1>전체 계좌</h1>
          <p className="page-description">국내·해외 계좌와 장기·중기·단기 투자 내역을 한 번에 입력하고 관리하세요.</p>
        </div>
        <span className="market-badge"><i /> SNOWFLAKE</span>
      </div>

      {!snowflakeConfigured && <div className="aa-message error">Snowflake API 연결 정보를 확인해 주세요.</div>}

      <section className="aa-summary" aria-label="계좌 요약">
        <article><span>전체 평가금액</span><strong>{won(summary.total)}</strong><small>등록 종목 {counts.all}개</small></article>
        <article><span>국내</span><strong>{won(summary.domestic)}</strong><small>{counts.domestic}개 종목</small></article>
        <article><span>해외</span><strong>{won(summary.overseas)}</strong><small>{counts.overseas}개 종목</small></article>
        <article><span>평가 손익</span><strong className={summary.profit >= 0 ? 'up' : 'down'}>{won(summary.profit, true)}</strong><small>수익률 {summary.rate >= 0 ? '+' : ''}{summary.rate.toFixed(2)}%</small></article>
      </section>

      <AccountBotManager refreshKey={accountRefreshKey} />

      <section className="aa-import-panel">
        <div><h2>전체 계좌 불러오기</h2><p>종목코드 없이 종목명만 작성한 엑셀(.xlsx, .xls) 또는 CSV 파일을 올릴 수 있습니다.</p></div>
        <div className="aa-import-actions">
          <button className="aa-button secondary" onClick={() => void downloadTemplate()}>양식 다운로드</button>
          <button className="aa-button primary" onClick={() => fileInput.current?.click()}>엑셀 업로드</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={uploadFile} hidden />
        </div>
      </section>

      <p className="aa-sync-note"><span className={snowflakeConfigured ? 'online' : ''} />{snowflakeConfigured ? 'Snowflake와 연결되었습니다. 서버 API를 통해 안전하게 저장됩니다.' : 'Snowflake 연결 대기 중입니다.'}</p>
      {error && <div className="aa-message error" role="alert">{error}</div>}
      {notice && !error && <div className="aa-message success" role="status">{notice}</div>}

      <section className="aa-sheet">
        <div className="aa-toolbar">
          <div className="aa-filters">
            <button className={region === 'ALL' ? 'active' : ''} onClick={() => setRegion('ALL')}>전체 <b>{counts.all}</b></button>
            <button className={region === 'DOMESTIC' ? 'active' : ''} onClick={() => setRegion('DOMESTIC')}>국내 <b>{counts.domestic}</b></button>
            <button className={region === 'OVERSEAS' ? 'active' : ''} onClick={() => setRegion('OVERSEAS')}>해외 <b>{counts.overseas}</b></button>
            <select value={term} onChange={(event) => setTerm(event.target.value as TermFilter)} aria-label="투자 기간 필터">
              <option value="ALL">모든 기간</option><option value="LONG">장기</option><option value="MEDIUM">중기</option><option value="SHORT">단기</option>
            </select>
          </div>
          <div className="aa-toolbar-actions">
            <button className="aa-button secondary" onClick={() => void clearAll()} disabled={!rows.length || loading}>전체 비우기</button>
            <button className="aa-button primary" onClick={addRow}>＋ 행 추가</button>
          </div>
        </div>

        <div className="aa-table-wrap">
          <table className="aa-table">
            <thead><tr><th>#</th><th>구분</th><th>투자 기간</th><th>증권사</th><th>계좌명</th><th>종목명</th><th>통화</th><th>수량</th><th>평균단가</th><th>현재가</th><th>환율</th><th>평가금액</th><th>평가손익</th><th>메모</th><th>저장</th><th /></tr></thead>
            <tbody>
              {visibleRows.map(({ row, index }) => (
                <tr key={row.clientId} className={row.status === 'error' ? 'has-error' : ''}>
                  <td className="aa-index">{index + 1}</td>
                  <td><select value={row.marketScope} onChange={(event) => { const marketScope = event.target.value as Holding['marketScope']; patchRow(index, { marketScope, currencyCode: marketScope === 'OVERSEAS' ? 'USD' : 'KRW', exchangeRate: marketScope === 'OVERSEAS' ? (row.exchangeRate || '1300') : '1' }); }} onPaste={(event) => pasteCells(event as unknown as ClipboardEvent<HTMLInputElement>, index, 0)}><option value="DOMESTIC">국내</option><option value="OVERSEAS">해외</option></select></td>
                  <td><select value={row.investmentTerm} onChange={(event) => patchRow(index, { investmentTerm: event.target.value as Holding['investmentTerm'] })}><option value="LONG">장기</option><option value="MEDIUM">중기</option><option value="SHORT">단기</option></select></td>
                  {(['brokerName', 'accountName', 'stockName'] as const).map((key, offset) => <td key={key}><input value={row[key]} onChange={(event) => patchRow(index, { [key]: event.target.value })} onPaste={(event) => pasteCells(event, index, offset + 2)} /></td>)}
                  <td><select value={row.currencyCode} onChange={(event) => patchRow(index, { currencyCode: event.target.value })}><option>KRW</option><option>USD</option><option>JPY</option><option>EUR</option><option>CNY</option></select></td>
                  {(['quantity', 'avgBuyPrice', 'currentPrice', 'exchangeRate'] as const).map((key, offset) => <td key={key}><input inputMode="decimal" value={row[key]} onChange={(event) => { const value = numericDraftValue(event.target.value); if (/^\d*(?:\.\d*)?$/.test(value)) patchRow(index, { [key]: value }); }} onPaste={(event) => pasteCells(event, index, offset + 6)} /></td>)}
                  <td className="aa-calculated">{Math.round(rowValue(row)).toLocaleString('ko-KR')}</td>
                  <td className={`aa-calculated ${rowValue(row) - rowCost(row) >= 0 ? 'up' : 'down'}`}>{rowValue(row) - rowCost(row) > 0 ? '+' : ''}{Math.round(rowValue(row) - rowCost(row)).toLocaleString('ko-KR')}</td>
                  <td><input value={row.memo} onChange={(event) => patchRow(index, { memo: event.target.value })} onPaste={(event) => pasteCells(event, index, 10)} /></td>
                  <td className="aa-save-cell"><button className={`aa-save ${row.status}`} onClick={() => void saveRow(index)} disabled={row.status === 'saving' || row.status === 'saved'}>{row.status === 'saving' ? '저장 중' : row.status === 'saved' ? '저장됨' : row.status === 'error' ? '재시도' : '저장'}</button></td>
                  <td><button className="aa-delete" aria-label={`${index + 1}행 삭제`} onClick={() => void removeRow(index)}>×</button></td>
                </tr>
              ))}
              {!loading && visibleRows.length === 0 && <tr><td className="aa-empty" colSpan={16}>조건에 맞는 보유 종목이 없습니다. ‘행 추가’ 또는 ‘엑셀 업로드’로 입력해 주세요.</td></tr>}
            </tbody>
          </table>
          {loading && <div className="aa-loading">데이터를 불러오는 중입니다.</div>}
        </div>
        <div className="aa-mobile-list" aria-label="보유 종목 목록">
          {visibleRows.map(({ row, index }) => {
            const profit = rowValue(row) - rowCost(row);
            const rate = rowCost(row) ? profit / rowCost(row) * 100 : 0;
            return <button type="button" className={`aa-mobile-card ${row.status === 'error' ? 'has-error' : ''}`} key={row.clientId} onClick={() => setMobileEditorIndex(index)}>
              <div className="aa-mobile-card-head">
                <span className="aa-mobile-logo">{(row.stockName || row.shortCode || '＋')[0]}</span>
                <div><strong>{row.stockName || '새 보유 종목'}</strong><small>{row.brokerName || '증권사 미입력'} · {row.accountName || '계좌명 미입력'}</small></div>
                <span className={`aa-row-status ${row.status}`}>{row.status === 'saving' ? '저장 중' : row.status === 'saved' ? '저장됨' : row.status === 'error' ? '확인 필요' : '수정 중'}</span>
              </div>
              <div className="aa-mobile-tags"><span>{row.marketScope === 'DOMESTIC' ? '국내' : '해외'}</span><span>{row.investmentTerm === 'LONG' ? '장기' : row.investmentTerm === 'MEDIUM' ? '중기' : '단기'}</span><span>{row.accountName || '계좌명 미입력'}</span></div>
              <div className="aa-mobile-values"><div><span>보유 수량</span><b>{draftNumber(row.quantity).toLocaleString('ko-KR')}주</b></div><div><span>평가금액</span><b>{won(rowValue(row))}</b></div><div><span>평가손익</span><b className={profit >= 0 ? 'up' : 'down'}>{won(profit, true)}<small>{rate >= 0 ? '+' : ''}{rate.toFixed(2)}%</small></b></div></div>
              <span className="aa-mobile-edit">눌러서 수정 <i>›</i></span>
            </button>;
          })}
          {!loading && visibleRows.length === 0 && <div className="aa-mobile-empty"><span>＋</span><b>조건에 맞는 보유 종목이 없습니다.</b><p>행 추가 또는 엑셀 업로드로 입력해 주세요.</p><button type="button" className="aa-button primary" onClick={addRow}>새 종목 추가</button></div>}
          {loading && <div className="aa-mobile-loading">데이터를 불러오는 중입니다.</div>}
        </div>
        <footer className="aa-sheet-footer"><span>표시 {visibleRows.length}개 · 전체 {rows.length}개</span><span className="aa-desktop-help">엑셀에서 여러 셀을 복사해 첫 셀에 붙여넣을 수 있습니다.</span><span className="aa-mobile-help">종목 카드를 누르면 큰 입력 화면에서 수정할 수 있습니다.</span></footer>
      </section>

      {mobileEditorIndex != null && rows[mobileEditorIndex] && <MobileAccountEditor
        row={rows[mobileEditorIndex]}
        index={mobileEditorIndex}
        patch={(changes) => patchRow(mobileEditorIndex, changes)}
        save={() => void saveRow(mobileEditorIndex)}
        remove={() => { void removeRow(mobileEditorIndex); setMobileEditorIndex(null); }}
        close={() => setMobileEditorIndex(null)}
      />}
    </div>
  );
}

function MobileAccountEditor({ row, index, patch, save, remove, close }: {
  row: AccountRow;
  index: number;
  patch: (changes: Partial<AccountRow>) => void;
  save: () => void;
  remove: () => void;
  close: () => void;
}) {
  const numericChange = (key: NumericKey, value: string) => {
    const next = numericDraftValue(value);
    if (/^\d*(?:\.\d*)?$/.test(next)) patch({ [key]: next });
  };
  const marketChange = (marketScope: Holding['marketScope']) => patch({
    marketScope,
    currencyCode: marketScope === 'OVERSEAS' ? 'USD' : 'KRW',
    exchangeRate: marketScope === 'OVERSEAS' ? (row.exchangeRate || '1300') : '1',
  });
  const profit = rowValue(row) - rowCost(row);

  return <div className="aa-mobile-editor" role="dialog" aria-modal="true" aria-labelledby="aa-mobile-editor-title">
    <button className="aa-mobile-editor-backdrop" aria-label="편집 닫기" onClick={close} />
    <section className="aa-mobile-editor-sheet">
      <div className="aa-mobile-handle" />
      <header><div><span>{index + 1}번째 보유 종목</span><h2 id="aa-mobile-editor-title">{row.stockName || '새 종목 입력'}</h2></div><button type="button" onClick={close} aria-label="닫기">×</button></header>
      <div className="aa-mobile-editor-scroll">
        <div className="aa-mobile-preview"><div><span>예상 평가금액</span><b>{won(rowValue(row))}</b></div><div><span>평가손익</span><b className={profit >= 0 ? 'up' : 'down'}>{won(profit, true)}</b></div></div>

        <fieldset><legend>투자 분류</legend><div className="aa-mobile-segment"><button type="button" className={row.marketScope === 'DOMESTIC' ? 'active' : ''} onClick={() => marketChange('DOMESTIC')}>국내</button><button type="button" className={row.marketScope === 'OVERSEAS' ? 'active' : ''} onClick={() => marketChange('OVERSEAS')}>해외</button></div><label>투자 기간<select value={row.investmentTerm} onChange={(event) => patch({ investmentTerm: event.target.value as Holding['investmentTerm'] })}><option value="LONG">장기</option><option value="MEDIUM">중기</option><option value="SHORT">단기</option></select></label></fieldset>

        <fieldset><legend>계좌 정보</legend><div className="aa-mobile-form-grid"><label>증권사<input value={row.brokerName} onChange={(event) => patch({ brokerName: event.target.value })} placeholder="예: 토스증권" /></label><label>계좌명<input value={row.accountName} onChange={(event) => patch({ accountName: event.target.value })} placeholder="예: 해외주식" /></label></div></fieldset>

        <fieldset><legend>종목 정보</legend><div className="aa-mobile-form-grid"><label>종목명<input value={row.stockName} onChange={(event) => patch({ stockName: event.target.value })} placeholder="예: 삼성전자 또는 NVIDIA" /></label><label>통화<select value={row.currencyCode} onChange={(event) => patch({ currencyCode: event.target.value })}><option>KRW</option><option>USD</option><option>JPY</option><option>EUR</option><option>CNY</option></select></label>{row.marketScope === 'OVERSEAS' && <label>환율<input inputMode="decimal" value={row.exchangeRate} onChange={(event) => numericChange('exchangeRate', event.target.value)} placeholder="예: 1350" /></label>}</div></fieldset>

        <fieldset><legend>보유 및 가격</legend><div className="aa-mobile-form-grid"><label>수량<input inputMode="decimal" value={row.quantity} onChange={(event) => numericChange('quantity', event.target.value)} placeholder="0" /></label><label>평균단가<input inputMode="decimal" value={row.avgBuyPrice} onChange={(event) => numericChange('avgBuyPrice', event.target.value)} placeholder="0" /></label><label className="wide">현재가<input inputMode="decimal" value={row.currentPrice} onChange={(event) => numericChange('currentPrice', event.target.value)} placeholder="0" /></label></div></fieldset>

        <fieldset><legend>메모</legend><label><textarea value={row.memo} onChange={(event) => patch({ memo: event.target.value })} placeholder="투자 근거나 계좌 관련 메모를 입력하세요." /></label></fieldset>
        <button type="button" className="aa-mobile-delete" onClick={remove}>이 보유 종목 삭제</button>
      </div>
      <footer><button type="button" className="aa-button secondary" onClick={close}>나중에</button><button type="button" className={`aa-button primary ${row.status}`} onClick={save} disabled={row.status === 'saving' || row.status === 'saved'}>{row.status === 'saving' ? '저장 중…' : row.status === 'saved' ? '저장 완료' : row.status === 'error' ? '확인 후 다시 저장' : '변경사항 저장'}</button></footer>
    </section>
  </div>;
}
