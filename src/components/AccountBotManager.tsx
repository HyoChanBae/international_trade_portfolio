import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  connectBotInstance,
  createMyAccount,
  disconnectBotInstance,
  fetchBotCatalog,
  fetchBotInstances,
  fetchMyAccounts,
  type BotCatalogItem,
  type BotInstance,
  type StockAccount,
} from '../lib/lukaApi';

const modeLabel: Record<BotInstance['executionMode'], string> = {
  REAL: '실전 투자',
  SCENARIO: '모의 투자',
  SIGNAL_ONLY: '신호만 받기',
};

const apiError = (reason: unknown) => {
  if (reason && typeof reason === 'object') {
    const issue = reason as { code?: string; message?: string };
    if (issue.code === '23505') return '이 계좌에는 같은 실행 방식의 봇이 이미 연결되어 있습니다.';
    if (issue.message) return issue.message;
  }
  return reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다.';
};

export function AccountBotManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const [accounts, setAccounts] = useState<StockAccount[]>([]);
  const [bots, setBots] = useState<BotCatalogItem[]>([]);
  const [instances, setInstances] = useState<BotInstance[]>([]);
  const [accountId, setAccountId] = useState('');
  const [botId, setBotId] = useState('');
  const [executionMode, setExecutionMode] = useState<BotInstance['executionMode']>('SCENARIO');
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [allocationPct, setAllocationPct] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [newBrokerName, setNewBrokerName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountMode, setNewAccountMode] = useState<StockAccount['accountMode']>('REAL');
  const [newMarketScope, setNewMarketScope] = useState<StockAccount['marketScope']>('DOMESTIC');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [accountRows, botRows, instanceRows] = await Promise.all([
        fetchMyAccounts(),
        fetchBotCatalog(),
        fetchBotInstances(),
      ]);
      setAccounts(accountRows);
      setBots(botRows);
      setInstances(instanceRows);
      setAccountId((current) => current || String(accountRows[0]?.accountId ?? ''));
      setBotId((current) => current || String(botRows[0]?.botId ?? ''));
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [refreshKey]);

  const instancesByAccount = useMemo(() => {
    const grouped = new Map<number, BotInstance[]>();
    instances.forEach((instance) => grouped.set(instance.accountId, [...(grouped.get(instance.accountId) ?? []), instance]));
    return grouped;
  }, [instances]);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountId || !botId) {
      setError('연결할 계좌와 봇을 선택해 주세요.');
      return;
    }
    const amount = Number(allocatedAmount || 0);
    const pct = Number(allocationPct || 0);
    if (amount < 0 || pct < 0 || pct > 100) {
      setError('투자금은 0 이상, 최대 투자 비중은 0~100 사이로 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await connectBotInstance({
        accountId: Number(accountId),
        botId: Number(botId),
        executionMode,
        allocatedAmount: amount,
        allocationPct: pct,
      });
      setAllocatedAmount('');
      setAllocationPct('');
      await load();
      setNotice('선택한 계좌에 봇을 연결했습니다.');
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setSaving(false);
    }
  };

  const selectExecutionMode = (nextMode: BotInstance['executionMode']) => {
    setExecutionMode(nextMode);
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newBrokerName.trim() || !newAccountName.trim()) {
      setError('증권사와 계좌명을 입력해 주세요.');
      return;
    }
    setAccountSaving(true);
    setError('');
    setNotice('');
    try {
      const createdId = await createMyAccount({
        brokerName: newBrokerName,
        accountName: newAccountName,
        accountMode: newAccountMode,
        marketScope: newMarketScope,
        baseCurrency: newMarketScope === 'OVERSEAS' ? 'USD' : 'KRW',
      });
      setNewBrokerName('');
      setNewAccountName('');
      setAccountFormOpen(false);
      await load();
      setAccountId(String(createdId));
      setNotice('새 계좌를 만들었습니다. 이제 봇 또는 보유 종목을 연결할 수 있습니다.');
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setAccountSaving(false);
    }
  };

  const disconnect = async (instance: BotInstance) => {
    if (!window.confirm(`${instance.bot?.botName || '봇'} 연결을 해제할까요?`)) return;
    setError('');
    setNotice('');
    try {
      await disconnectBotInstance(instance.botInstanceId);
      setInstances((current) => current.filter((item) => item.botInstanceId !== instance.botInstanceId));
      setNotice('봇 연결을 해제했습니다. 기존 거래 기록은 유지됩니다.');
    } catch (reason) {
      setError(apiError(reason));
    }
  };

  return <section className="account-bot-manager">
    <div className="abm-heading"><div><span>PERSONAL BOT WORKSPACE</span><h2>내 계좌와 AI 봇 연결</h2><p>봇 템플릿은 공유하고, 실행 설정과 성과는 내 계좌별로 분리합니다.</p></div><div className="abm-heading-actions"><strong>{instances.length}개 연결됨</strong><button type="button" onClick={() => setAccountFormOpen((open) => !open)}>＋ 계좌 추가</button></div></div>
    {error && <div className="aa-message error" role="alert">{error}</div>}
    {notice && !error && <div className="aa-message success" role="status">{notice}</div>}
    {accountFormOpen && <form className="abm-account-form" onSubmit={createAccount}>
      <div><b>새 계좌 만들기</b><span>실제 계좌번호나 비밀번호는 입력하지 않습니다.</span></div>
      <label>증권사<input value={newBrokerName} onChange={(event) => setNewBrokerName(event.target.value)} placeholder="예: 토스증권" /></label>
      <label>계좌명<input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="예: 해외주식" /></label>
      <label>계좌 구분<select value={newAccountMode} onChange={(event) => setNewAccountMode(event.target.value as StockAccount['accountMode'])}><option value="REAL">실계좌</option><option value="SCENARIO">모의계좌</option></select></label>
      <label>투자 시장<select value={newMarketScope} onChange={(event) => setNewMarketScope(event.target.value as StockAccount['marketScope'])}><option value="DOMESTIC">국내</option><option value="OVERSEAS">해외</option><option value="BOTH">국내·해외</option></select></label>
      <div className="abm-account-form-actions"><button type="button" onClick={() => setAccountFormOpen(false)}>취소</button><button className="aa-button primary" disabled={accountSaving}>{accountSaving ? '생성 중…' : '계좌 생성'}</button></div>
    </form>}
    {loading ? <div className="abm-loading">내 계좌와 봇 연결을 불러오는 중입니다.</div> : <>
      <div className="abm-layout">
        <div className="abm-accounts">
          {accounts.length ? accounts.map((account) => {
            const linked = instancesByAccount.get(account.accountId) ?? [];
            return <article className="abm-account" key={account.accountId}>
              <header><div className="abm-account-icon">₩</div><div><span>{account.brokerName}</span><h3>{account.accountName}</h3></div><em>{account.accountMode === 'REAL' ? '실계좌' : '모의계좌'}</em></header>
              <div className="abm-account-meta"><span>{account.marketScope === 'DOMESTIC' ? '국내' : account.marketScope === 'OVERSEAS' ? '해외' : '국내·해외'}</span><span>{account.baseCurrency}</span><span>{account.syncMethod === 'EXCEL' ? '엑셀 연동' : account.syncMethod === 'API' ? 'API 연동' : '직접 입력'}</span></div>
              <div className="abm-instance-list">
                {linked.length ? linked.map((instance) => <div className="abm-instance" key={instance.botInstanceId}>
                  <span className="abm-bot-avatar">AI</span>
                  <div><b>{instance.bot?.botName || `BOT ${instance.botId}`}</b><small>{modeLabel[instance.executionMode]} · {instance.allocationPct ? `최대 ${instance.allocationPct}%` : '비중 제한 없음'}{instance.allocatedAmount ? ` · ${instance.allocatedAmount.toLocaleString('ko-KR')}원` : ''}</small></div>
                  <button type="button" onClick={() => void disconnect(instance)}>연결 해제</button>
                </div>) : <p className="abm-empty">아직 연결된 봇이 없습니다.</p>}
              </div>
            </article>;
          }) : <div className="abm-no-account"><span>＋</span><b>먼저 계좌를 만들어 주세요</b><p>아래 표에서 보유 종목 한 행을 저장하면 계좌가 자동 생성됩니다.</p></div>}
        </div>
        <form className="abm-connect" onSubmit={connect}>
          <span className="abm-form-kicker">NEW CONNECTION</span><h3>새 봇 연결</h3>
          <label>계좌<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={!accounts.length}>{accounts.length ? accounts.map((account) => <option value={account.accountId} key={account.accountId}>{account.brokerName} · {account.accountName}</option>) : <option value="">계좌 없음</option>}</select></label>
          <label>AI 봇<select value={botId} onChange={(event) => setBotId(event.target.value)} disabled={!bots.length}>{bots.length ? bots.map((bot) => <option value={bot.botId} key={bot.botId}>{bot.botName}</option>) : <option value="">사용 가능한 봇 없음</option>}</select></label>
          <label>실행 방식<select value={executionMode} onChange={(event) => selectExecutionMode(event.target.value as BotInstance['executionMode'])}><option value="SCENARIO">모의 투자</option><option value="SIGNAL_ONLY">신호만 받기</option><option value="REAL">실전 투자</option></select></label>
          <div className="abm-form-row"><label>배정 투자금<input inputMode="decimal" value={allocatedAmount} onChange={(event) => /^\d*$/.test(event.target.value) && setAllocatedAmount(event.target.value)} placeholder="예: 10000000" /></label><label>최대 비중 (%)<input inputMode="decimal" value={allocationPct} onChange={(event) => /^\d*(?:\.\d*)?$/.test(event.target.value) && setAllocationPct(event.target.value)} placeholder="예: 30" /></label></div>
          <button className="aa-button primary" disabled={saving || !accounts.length || !bots.length}>{saving ? '연결 중…' : '계좌에 봇 연결'}</button>
          <small>실전 투자는 연결 설정만 저장하며 실제 주문은 별도의 증권사 API 승인이 필요합니다.</small>
        </form>
      </div>
    </>}
  </section>;
}
