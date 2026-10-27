import { mutateSnowflake, readSnowflakeBotSnapshot, readSnowflakeReportSnapshot, readSnowflakeTable } from './snowflakeApi';

type Row = Record<string, unknown>;

const value = (row: Row | undefined, name: string) => row?.[name] ?? row?.[name.toLowerCase()];
const number = (input: unknown, fallback = 0) => {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const text = (input: unknown, fallback = '') => input == null ? fallback : String(input);

export type Bot = {
  id: number; rank: number; code: string; name: string; type: string; model: string;
  description: string; strategyType: string; logic: string;
  returnRate: number; cumulative: number; trades: number; startAmount?: number;
  currentValue?: number; tradeDays?: number; tradeStartDate?: string; tradeEndDate?: string;
  virtualBalance?: number; totalBuyAmount?: number; marketValue?: number; hasAccount?: boolean;
};

export type BotTrade = {
  id: number; botId: number; symbol: string; symbolName: string; reason: string;
  buyPrice: number; buyAt: string; currentPrice: number; quantity: number;
};

export type CalendarEvent = {
  key: string; code: string; name: string; category: string; source: string;
  referencePeriod: string; releaseAt: string; importance: number; url: string; status: string;
};

export type MarketReportData = {
  report: string;
  createdAt: string;
  context: unknown;
};

export type Holding = {
  holdingId?: number; accountId?: number; brokerName: string; accountName: string;
  accountType: string; marketScope: 'DOMESTIC' | 'OVERSEAS'; investmentTerm: 'LONG' | 'MEDIUM' | 'SHORT';
  shortCode: string; stockName: string; marketName?: string; currencyCode: string;
  quantity: number; avgBuyPrice: number; currentPrice: number; exchangeRate: number; memo: string;
};

export type StockAccount = {
  accountId: number;
  brokerName: string;
  accountName: string;
  accountType: string;
  accountMode: 'REAL' | 'SCENARIO';
  marketScope: 'DOMESTIC' | 'OVERSEAS' | 'BOTH';
  baseCurrency: string;
  connectionStatus: 'NOT_CONNECTED' | 'CONNECTED' | 'EXPIRED' | 'ERROR';
  syncMethod: 'MANUAL' | 'EXCEL' | 'API';
  isActive: boolean;
};

export type BotCatalogItem = {
  botId: number;
  botCode: string;
  botName: string;
  description: string;
  modelType: string;
  strategyType: string;
};

export type BotInstance = {
  botInstanceId: number;
  botId: number;
  accountId: number;
  executionMode: 'REAL' | 'SCENARIO' | 'SIGNAL_ONLY';
  allocatedAmount: number;
  allocationPct: number;
  isActive: boolean;
  startedAt: string;
  bot?: BotCatalogItem;
};

async function all(name: string) {
  return readSnowflakeTable(name);
}

async function optionalAll(name: string) {
  try {
    return await all(name);
  } catch (error) {
    const item = error as { code?: string; message?: string };
    if (item?.code === '002003' || /does not exist|not authorized/i.test(item?.message ?? '')) return [];
    throw error;
  }
}

export async function fetchBots(scenario = false): Promise<Bot[]> {
  const snapshot = await readSnowflakeBotSnapshot(scenario);
  const botRows = snapshot.bots;
  const perfRows = snapshot.performances;
  const tradeRows = snapshot.trades;
  const accountRows = snapshot.accounts;
  const quoteRows = snapshot.quotes;

  const latestQuotes = new Map<string, Row>();
  quoteRows
    .sort((a, b) => text(value(b, 'UPDATE_DT')).localeCompare(text(value(a, 'UPDATE_DT'))))
    .forEach((row) => {
      const symbol = text(value(row, 'SYMBOL')).split('.')[0];
      if (!latestQuotes.has(symbol)) latestQuotes.set(symbol, row);
    });

  const active = botRows.filter((row) => text(value(row, 'IS_ACTIVE'), 'Y').toUpperCase() !== 'N');
  const mapped = active.map((row) => {
    const id = number(value(row, 'BOT_ID'));
    const performances = perfRows
      .filter((perf) => number(value(perf, 'BOT_ID')) === id)
      .sort((a, b) => text(value(b, 'PERF_DATE')).localeCompare(text(value(a, 'PERF_DATE'))));
    const latest = performances[0];
    const account = accountRows.find((item) => number(value(item, 'BOT_ID')) === id);
    const trades = tradeRows.filter((item) => number(value(item, 'BOT_ID')) === id);
    const startAmount = number(value(account, 'VIRTUAL_START_AMOUNT'), 10_000_000);
    const cash = number(value(account, 'VIRTUAL_TOTAL_BALANCE'), startAmount);
    const tradeCount = trades.reduce((sum, item) => sum + number(value(item, 'TRADE_COUNT')), 0);
    const totalBuy = trades.reduce((sum, item) => sum + number(value(item, 'TOTAL_BUY_AMOUNT')), 0);
    const marketValue = trades.reduce((sum, item) => {
      const symbol = text(value(item, 'SYMBOL')).split('.')[0];
      const currentPrice = number(value(latestQuotes.get(symbol), 'CURRENT_PRICE'));
      return sum + currentPrice * number(value(item, 'TOTAL_QUANTITY'));
    }, 0);
    const currentValue = account ? cash - totalBuy + marketValue : startAmount * (1 + number(value(latest, 'CUM_RETURN')) / 100);
    return {
      id,
      rank: 0,
      code: text(value(row, 'BOT_CODE')),
      name: text(value(row, 'BOT_NAME'), text(value(row, 'BOT_CODE'), `BOT ${id}`)),
      type: text(value(row, 'DESCRIPTION'), text(value(row, 'STRATEGY_TYPE'), '전략 미설정')),
      model: text(value(row, 'MODEL_TYPE'), '—'),
      description: text(value(row, 'DESCRIPTION')),
      strategyType: text(value(row, 'STRATEGY_TYPE')),
      logic: text(value(row, 'BOT_LOGIC'), text(value(row, 'LOGIC_DESCRIPTION'), text(value(row, 'DESCRIPTION')))),
      returnRate: number(value(latest, 'DAILY_RETURN')),
      cumulative: number(value(latest, 'CUM_RETURN')),
      trades: tradeCount,
      startAmount,
      currentValue,
      tradeDays: number(value(account, 'TRADE_DAYS')),
      tradeStartDate: text(value(account, 'TRADE_START_DATE')),
      tradeEndDate: text(value(account, 'TRADE_END_DATE')),
      virtualBalance: cash,
      totalBuyAmount: totalBuy,
      marketValue,
      hasAccount: Boolean(account),
    };
  });
  return mapped.sort((a, b) => b.cumulative - a.cumulative).map((bot, index) => ({ ...bot, rank: index + 1 }));
}

export async function fetchBotTrades(botId: number, scenario = false): Promise<BotTrade[]> {
  const source = scenario ? 'BOT_TRADE_SENARIO' : 'BOT_TRADE';
  const [tradeRows, quoteRows] = await Promise.all([all(source), optionalAll('BOT_TRADE_CURRENT_INFO')]);
  const latestQuotes = new Map<string, Row>();
  quoteRows
    .sort((a, b) => text(value(b, 'UPDATE_DT')).localeCompare(text(value(a, 'UPDATE_DT'))))
    .forEach((row) => {
      const symbol = text(value(row, 'SYMBOL')).split('.')[0];
      if (!latestQuotes.has(symbol)) latestQuotes.set(symbol, row);
    });
  return tradeRows
    .filter((row) => number(value(row, 'BOT_ID')) === botId)
    .sort((a, b) => text(value(b, 'BUY_AT')).localeCompare(text(value(a, 'BUY_AT'))))
    .map((row) => {
      const symbol = text(value(row, 'SYMBOL'));
      const quote = latestQuotes.get(symbol.split('.')[0]);
      return {
        id: number(value(row, 'TRADE_ID')), botId, symbol,
        symbolName: text(value(row, 'SYMBOL_NAME'), text(value(quote, 'SYMBOL_NAME'))),
        reason: text(value(row, 'SELECT_REASON')), buyPrice: number(value(row, 'BUY_PRICE')),
        buyAt: text(value(row, 'BUY_AT')), currentPrice: number(value(quote, 'CURRENT_PRICE')),
        quantity: number(value(row, 'BUY_QTY')),
      };
    });
}

export async function fetchBotTradeHistory(botId: number, scenario = false) {
  const [trades, quotes] = await Promise.all([
    fetchBotTrades(botId, scenario),
    optionalAll('BOT_TRADE_CURRENT_INFO'),
  ]);
  const currentPriceUpdatedAt = quotes
    .map((row) => text(value(row, 'UPDATE_DT')))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || '';
  return { trades, currentPriceUpdatedAt };
}

export async function fetchMarketReport(symbols: 'MARKET' | 'MACRO' = 'MARKET'): Promise<MarketReportData | null> {
  const rows = await readSnowflakeReportSnapshot();
  const row = rows
    .filter((item) => text(value(item, 'SYMBOLS')).toUpperCase() === symbols)
    .sort((a, b) => text(value(b, 'CREATED_AT')).localeCompare(text(value(a, 'CREATED_AT'))))[0];
  return row ? {
    report: text(value(row, 'REPORT')),
    createdAt: text(value(row, 'CREATED_AT')),
    context: value(row, 'MARKET_CONTEXT'),
  } : null;
}

export async function fetchCalendarEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const rows = await all('MACRO_RELEASE_CALENDAR');
  return rows
    .filter((row) => {
      const releaseAt = new Date(text(value(row, 'RELEASE_AT_UTC'))).getTime();
      return releaseAt >= from.getTime() && releaseAt < to.getTime();
    })
    .sort((a, b) => text(value(a, 'RELEASE_AT_UTC')).localeCompare(text(value(b, 'RELEASE_AT_UTC'))))
    .map((row) => ({
    key: text(value(row, 'EVENT_KEY')), code: text(value(row, 'INDICATOR_CODE')),
    name: text(value(row, 'INDICATOR_NAME')), category: text(value(row, 'CATEGORY'), '기타'),
    source: text(value(row, 'SOURCE')), referencePeriod: text(value(row, 'REFERENCE_PERIOD')),
    releaseAt: text(value(row, 'RELEASE_AT_UTC')), importance: number(value(row, 'IMPORTANCE'), 3),
    url: text(value(row, 'EVENT_URL')), status: text(value(row, 'STATUS')),
  }));
}

export async function fetchHoldings(): Promise<Holding[]> {
  const accounts = await all('STOCK_ACCOUNTS');
  if (!accounts.length) return [];
  const [holdings, stocks] = await Promise.all([
    all('STOCK_ACCOUNT_HOLDINGS'),
    optionalAll('STOCK_MASTER'),
  ]);
  return holdings.map((row) => {
    const accountId = number(value(row, 'ACCOUNT_ID'));
    const account = accounts.find((item) => number(value(item, 'ACCOUNT_ID')) === accountId);
    const code = text(value(row, 'SHORT_CODE'));
    const stock = stocks.find((item) => text(value(item, 'SHORT_CODE')) === code);
    return {
      holdingId: number(value(row, 'HOLDING_ID')), accountId,
      brokerName: text(value(account, 'BROKER_NAME')), accountName: text(value(account, 'ACCOUNT_NAME')),
      accountType: text(value(account, 'ACCOUNT_TYPE'), 'GENERAL'),
      marketScope: text(value(row, 'MARKET_SCOPE'), 'DOMESTIC') as Holding['marketScope'],
      investmentTerm: text(value(row, 'INVESTMENT_TERM'), 'LONG') as Holding['investmentTerm'],
      shortCode: code, stockName: text(value(row, 'STOCK_NAME'), text(value(stock, 'STOCK_NAME'))),
      marketName: text(value(stock, 'MARKET_NAME')), currencyCode: text(value(row, 'CURRENCY_CODE'), 'KRW'),
      quantity: number(value(row, 'QUANTITY')), avgBuyPrice: number(value(row, 'AVG_BUY_PRICE')),
      currentPrice: number(value(row, 'CURRENT_PRICE')), exchangeRate: number(value(row, 'EXCHANGE_RATE'), 1),
      memo: text(value(row, 'MEMO')),
    };
  });
}

export async function saveHolding(row: Holding): Promise<number> {
  const stockName = row.stockName.trim();
  if (!stockName) throw new Error('종목명을 입력해 주세요.');
  const result = await mutateSnowflake('saveHolding', { ...row, stockName });
  if (!result.id) throw new Error('저장된 보유 종목 ID를 확인할 수 없습니다.');
  return result.id;
}

export async function deleteHolding(id: number) {
  await mutateSnowflake('deleteHolding', { id });
}

export async function deleteAllHoldings() {
  await mutateSnowflake('deleteAllHoldings');
}

const mapAccount = (row: Row): StockAccount => ({
  accountId: number(value(row, 'ACCOUNT_ID')),
  brokerName: text(value(row, 'BROKER_NAME')),
  accountName: text(value(row, 'ACCOUNT_NAME')),
  accountType: text(value(row, 'ACCOUNT_TYPE'), 'GENERAL'),
  accountMode: text(value(row, 'ACCOUNT_MODE'), 'REAL') as StockAccount['accountMode'],
  marketScope: text(value(row, 'MARKET_SCOPE'), 'DOMESTIC') as StockAccount['marketScope'],
  baseCurrency: text(value(row, 'BASE_CURRENCY'), 'KRW'),
  connectionStatus: text(value(row, 'CONNECTION_STATUS'), 'NOT_CONNECTED') as StockAccount['connectionStatus'],
  syncMethod: text(value(row, 'SYNC_METHOD'), 'MANUAL') as StockAccount['syncMethod'],
  isActive: Boolean(value(row, 'IS_ACTIVE') ?? true),
});

const mapBotCatalogItem = (row: Row): BotCatalogItem => ({
  botId: number(value(row, 'BOT_ID')),
  botCode: text(value(row, 'BOT_CODE')),
  botName: text(value(row, 'BOT_NAME'), text(value(row, 'BOT_CODE'), '이름 없는 봇')),
  description: text(value(row, 'DESCRIPTION')),
  modelType: text(value(row, 'MODEL_TYPE'), '—'),
  strategyType: text(value(row, 'STRATEGY_TYPE'), '—'),
});

export async function fetchMyAccounts(): Promise<StockAccount[]> {
  return (await all('STOCK_ACCOUNTS')).map(mapAccount);
}

export async function createMyAccount(input: {
  brokerName: string;
  accountName: string;
  accountMode: StockAccount['accountMode'];
  marketScope: StockAccount['marketScope'];
  baseCurrency: string;
}) {
  const result = await mutateSnowflake('createAccount', input);
  const accountId = result.id ?? 0;
  if (!accountId) throw new Error('생성된 계좌 ID를 확인할 수 없습니다.');
  return accountId;
}

export async function fetchBotCatalog(): Promise<BotCatalogItem[]> {
  return (await all('BOT_SENARIO'))
    .filter((row) => text(value(row, 'IS_ACTIVE'), 'Y').toUpperCase() !== 'N')
    .sort((a, b) => number(value(a, 'BOT_ID')) - number(value(b, 'BOT_ID')))
    .map(mapBotCatalogItem);
}

export async function fetchBotInstances(): Promise<BotInstance[]> {
  const [accounts, bots, instanceRows] = await Promise.all([
    fetchMyAccounts(),
    fetchBotCatalog(),
    all('BOT_INSTANCE'),
  ]);
  const accountIds = new Set(accounts.map((account) => account.accountId));
  const botMap = new Map(bots.map((bot) => [bot.botId, bot]));
  return instanceRows
    .filter((row) => accountIds.has(number(value(row, 'ACCOUNT_ID'))))
    .map((row) => {
      const botId = number(value(row, 'BOT_ID'));
      return {
        botInstanceId: number(value(row, 'BOT_INSTANCE_ID')),
        botId,
        accountId: number(value(row, 'ACCOUNT_ID')),
        executionMode: text(value(row, 'EXECUTION_MODE'), 'SCENARIO') as BotInstance['executionMode'],
        allocatedAmount: number(value(row, 'ALLOCATED_AMOUNT')),
        allocationPct: number(value(row, 'ALLOCATION_PCT')),
        isActive: Boolean(value(row, 'IS_ACTIVE') ?? true),
        startedAt: text(value(row, 'STARTED_AT')),
        bot: botMap.get(botId),
      };
    });
}

export async function connectBotInstance(input: {
  accountId: number;
  botId: number;
  executionMode: BotInstance['executionMode'];
  allocatedAmount: number;
  allocationPct: number;
}) {
  const result = await mutateSnowflake('connectBotInstance', input);
  return result.id ?? 0;
}

export async function disconnectBotInstance(botInstanceId: number) {
  await mutateSnowflake('disconnectBotInstance', { id: botInstanceId });
}
