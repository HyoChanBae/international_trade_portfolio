import './_env.js';
import { query, tableName } from './_snowflake.js';
import { sessionFromRequest } from './_session.js';

type Row = Record<string, unknown>;
type ApiUser = { id: string; userKey: number };
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

const publicTables = new Set([
  'BOT', 'BOT_SENARIO', 'BOT_PERF_DAILY', 'BOT_PERF_DAILY_SENARIO', 'BOT_TRADE',
  'BOT_TRADE_SENARIO', 'BOT_SENARIO_ACCOUNT', 'BOT_TRADE_CURRENT_INFO', 'MARKET_REPORTS',
  'MACRO_RELEASE_CALENDAR', 'STOCK_MASTER',
]);
const privateTables = new Set(['STOCK_ACCOUNTS', 'STOCK_ACCOUNT_HOLDINGS', 'BOT_INSTANCE']);

const json = (body: unknown, status = 200, cacheControl = 'no-store') => Response.json(body, {
  status,
  headers: { 'Cache-Control': cacheControl },
});

async function optionalQuery(sqlText: string) {
  try {
    return await query(sqlText);
  } catch (reason) {
    const error = reason as { code?: string; message?: string };
    if (error.code === '002003' || /does not exist|not authorized/i.test(error.message ?? '')) return [];
    throw reason;
  }
}

async function selectBotSnapshot(scenario: boolean) {
  const botTable = scenario ? 'BOT_SENARIO' : 'BOT';
  const perfTable = scenario ? 'BOT_PERF_DAILY_SENARIO' : 'BOT_PERF_DAILY';
  const tradeTable = scenario ? 'BOT_TRADE_SENARIO' : 'BOT_TRADE';
  const accountQuery = scenario
    ? optionalQuery(`SELECT * FROM ${tableName('BOT_SENARIO_ACCOUNT')}`)
    : Promise.resolve([]);

  const [bots, performances, trades, accounts, quotes] = await Promise.all([
    query(`SELECT * FROM ${tableName(botTable)} WHERE COALESCE(UPPER(TO_VARCHAR(IS_ACTIVE)), 'Y') <> 'N'`),
    query(`SELECT * FROM ${tableName(perfTable)} QUALIFY ROW_NUMBER() OVER (PARTITION BY BOT_ID ORDER BY PERF_DATE DESC) = 1`),
    query(`SELECT BOT_ID, SYMBOL, COUNT(*) AS TRADE_COUNT, SUM(BUY_PRICE * BUY_QTY) AS TOTAL_BUY_AMOUNT, SUM(BUY_QTY) AS TOTAL_QUANTITY FROM ${tableName(tradeTable)} GROUP BY BOT_ID, SYMBOL`),
    accountQuery,
    optionalQuery(`SELECT * FROM ${tableName('BOT_TRADE_CURRENT_INFO')} QUALIFY ROW_NUMBER() OVER (PARTITION BY SPLIT_PART(TO_VARCHAR(SYMBOL), '.', 1) ORDER BY UPDATE_DT DESC) = 1`),
  ]);

  return { bots, performances, trades, accounts, quotes };
}

async function selectReportSnapshot() {
  return query(
    `SELECT * FROM ${tableName('MARKET_REPORTS')} WHERE UPPER(TO_VARCHAR(SYMBOLS)) IN ('MARKET', 'MACRO') QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(TO_VARCHAR(SYMBOLS)) ORDER BY CREATED_AT DESC) = 1`,
  );
}

async function selectHmrcTradeSnapshot() {
  const hs6Codes = [
    '270900', '271111', '271121', '271112', '271113', '290121', '290122', '290220',
    '390110', '390210', '841182', '740311', '740811', '760110', '750210', '720839',
    '720917', '854231', '854232', '854141', '870380', '850760', '100199', '090111',
    '710812', '710691',
  ].map((code) => `'${code}'`).join(', ');
  return query(`
    SELECT
      TO_VARCHAR(O.MONTH_ID) AS MONTH_ID,
      TO_VARCHAR(O.FLOW_TYPE_ID) AS FLOW_TYPE_ID,
      COALESCE(TO_VARCHAR(F.FLOWTYPEDESCRIPTION), TO_VARCHAR(O.FLOW_TYPE_ID)) AS FLOW_DESCRIPTION,
      TO_VARCHAR(C.HS2CODE) AS HS2CODE,
      TO_VARCHAR(C.HS4CODE) AS HS4CODE,
      TO_VARCHAR(C.HS6CODE) AS HS6CODE,
      SUM(COALESCE(TRY_TO_DOUBLE(O.VALUE), 0)) AS TRADE_VALUE,
      SUM(COALESCE(TRY_TO_DOUBLE(O.NET_MASS), 0)) AS NET_MASS
    FROM ${tableName('UKTI_OTS')} O
    JOIN ${tableName('UKTI_COMMODITY')} C
      ON TO_VARCHAR(C.COMMODITYID) = TO_VARCHAR(O.COMMODITY_ID)
    LEFT JOIN ${tableName('UKTI_FLOW_TYPE')} F
      ON TO_VARCHAR(F.FLOWTYPEID) = TO_VARCHAR(O.FLOW_TYPE_ID)
    WHERE TO_VARCHAR(C.HS6CODE) IN (${hs6Codes})
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY 1, 6
  `);
}

async function userFrom(request: Request): Promise<ApiUser> {
  const session = sessionFromRequest(request);
  if (!session) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  return { id: session.userId, userKey: session.userKey };
}

async function selectTable(table: string, user: ApiUser) {
  if (publicTables.has(table)) return query(`SELECT * FROM ${tableName(table)}`);
  if (!privateTables.has(table)) throw Object.assign(new Error('허용되지 않은 테이블입니다.'), { status: 400 });
  if (table === 'STOCK_ACCOUNTS') {
    return query(`SELECT * FROM ${tableName(table)} WHERE USER_ID = ? ORDER BY CREATED_AT`, [user.id]);
  }
  if (table === 'STOCK_ACCOUNT_HOLDINGS') {
    return query(
      `SELECT H.* FROM ${tableName(table)} H JOIN ${tableName('STOCK_ACCOUNTS')} A ON A.ACCOUNT_ID = H.ACCOUNT_ID WHERE A.USER_ID = ?`,
      [user.id],
    );
  }
  return query(
    `SELECT I.* FROM ${tableName(table)} I JOIN ${tableName('STOCK_ACCOUNTS')} A ON A.ACCOUNT_ID = I.ACCOUNT_ID WHERE A.USER_ID = ?`,
    [user.id],
  );
}

const cleanText = (value: unknown) => String(value ?? '').trim();
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nullableFinite = (value: unknown) => Number.isFinite(Number(value)) && Number(value) !== 0 ? Number(value) : null;

async function findOrCreateAccount(user: ApiUser, input: Row) {
  const brokerName = cleanText(input.brokerName);
  const accountName = cleanText(input.accountName);
  const accountMode = cleanText(input.accountMode) || 'REAL';
  if (!brokerName || !accountName) throw Object.assign(new Error('증권사와 계좌명을 입력해 주세요.'), { status: 400 });
  const accounts = tableName('STOCK_ACCOUNTS');
  const existing = await query<{ ACCOUNT_ID: number }>(
    `SELECT ACCOUNT_ID FROM ${accounts} WHERE USER_ID = ? AND BROKER_NAME = ? AND ACCOUNT_NAME = ? AND ACCOUNT_MODE = ? LIMIT 1`,
    [user.id, brokerName, accountName, accountMode],
  );
  const now = new Date().toISOString();
  if (existing[0]?.ACCOUNT_ID) {
    await query(
      `UPDATE ${accounts} SET ACCOUNT_TYPE = ?, MARKET_SCOPE = ?, BASE_CURRENCY = ?, IS_ACTIVE = ?, UPDATED_AT = ? WHERE ACCOUNT_ID = ? AND USER_ID = ?`,
      [cleanText(input.accountType) || 'GENERAL', cleanText(input.marketScope) || 'DOMESTIC', cleanText(input.baseCurrency) || 'KRW', true, now, existing[0].ACCOUNT_ID, user.id],
    );
    return existing[0].ACCOUNT_ID;
  }
  await query(
    `INSERT INTO ${accounts} (USER_ID, USER_KEY, BROKER_NAME, ACCOUNT_NAME, ACCOUNT_TYPE, ACCOUNT_MODE, MARKET_SCOPE, BASE_CURRENCY, CONNECTION_STATUS, SYNC_METHOD, IS_ACTIVE, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.userKey, brokerName, accountName, cleanText(input.accountType) || 'GENERAL', accountMode, cleanText(input.marketScope) || 'DOMESTIC', cleanText(input.baseCurrency) || 'KRW', 'NOT_CONNECTED', 'MANUAL', true, now, now],
  );
  const created = await query<{ ACCOUNT_ID: number }>(
    `SELECT ACCOUNT_ID FROM ${accounts} WHERE USER_ID = ? AND BROKER_NAME = ? AND ACCOUNT_NAME = ? AND ACCOUNT_MODE = ? ORDER BY CREATED_AT DESC LIMIT 1`,
    [user.id, brokerName, accountName, accountMode],
  );
  if (!created[0]?.ACCOUNT_ID) throw new Error('생성된 계좌 ID를 확인할 수 없습니다. Snowflake 테이블의 ACCOUNT_ID 기본값을 확인해 주세요.');
  return created[0].ACCOUNT_ID;
}

async function saveHolding(user: ApiUser, input: Row) {
  const stockName = cleanText(input.stockName);
  if (!stockName) throw Object.assign(new Error('종목명을 입력해 주세요.'), { status: 400 });
  const accountId = await findOrCreateAccount(user, {
    brokerName: input.brokerName, accountName: input.accountName, accountType: input.accountType,
    accountMode: 'REAL', marketScope: input.marketScope, baseCurrency: input.currencyCode,
  });
  const holdings = tableName('STOCK_ACCOUNT_HOLDINGS');
  const accounts = tableName('STOCK_ACCOUNTS');
  const now = new Date().toISOString();
  const values = [
    null, stockName, cleanText(input.marketScope) || 'DOMESTIC', cleanText(input.investmentTerm) || 'LONG',
    finite(input.quantity), finite(input.avgBuyPrice), finite(input.currentPrice), cleanText(input.currencyCode) || 'KRW',
    finite(input.exchangeRate, 1), cleanText(input.memo), now.slice(0, 10), now, now,
  ];
  const holdingId = finite(input.holdingId);
  if (holdingId) {
    await query(
      `UPDATE ${holdings} SET SHORT_CODE = ?, STOCK_NAME = ?, MARKET_SCOPE = ?, INVESTMENT_TERM = ?, QUANTITY = ?, AVG_BUY_PRICE = ?, CURRENT_PRICE = ?, CURRENCY_CODE = ?, EXCHANGE_RATE = ?, MEMO = ?, AS_OF_DATE = ?, PRICE_UPDATED_AT = ?, UPDATED_AT = ? WHERE HOLDING_ID = ? AND ACCOUNT_ID IN (SELECT ACCOUNT_ID FROM ${accounts} WHERE USER_ID = ?)`,
      [...values, holdingId, user.id],
    );
    return holdingId;
  }
  await query(
    `INSERT INTO ${holdings} (ACCOUNT_ID, USER_ID, USER_KEY, SHORT_CODE, STOCK_NAME, MARKET_SCOPE, INVESTMENT_TERM, QUANTITY, AVG_BUY_PRICE, CURRENT_PRICE, CURRENCY_CODE, EXCHANGE_RATE, MEMO, AS_OF_DATE, PRICE_UPDATED_AT, UPDATED_AT, CREATED_AT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, user.id, user.userKey, ...values, now],
  );
  const created = await query<{ HOLDING_ID: number }>(
    `SELECT HOLDING_ID FROM ${holdings} WHERE ACCOUNT_ID = ? AND STOCK_NAME = ? ORDER BY CREATED_AT DESC LIMIT 1`,
    [accountId, stockName],
  );
  if (!created[0]?.HOLDING_ID) throw new Error('저장된 보유 종목 ID를 확인할 수 없습니다. Snowflake 테이블의 HOLDING_ID 기본값을 확인해 주세요.');
  return created[0].HOLDING_ID;
}

async function handlePost(request: Request, user: ApiUser) {
  const body = await request.json() as { action?: string; data?: Row };
  const data = body.data ?? {};
  if (body.action === 'saveHolding') return json({ id: await saveHolding(user, data) });
  if (body.action === 'createAccount') {
    const id = await findOrCreateAccount(user, {
      ...data,
      accountType: cleanText(data.accountMode) === 'SCENARIO' ? 'VIRTUAL' : 'GENERAL',
    });
    return json({ id });
  }
  if (body.action === 'deleteHolding' || body.action === 'deleteAllHoldings') {
    const where = body.action === 'deleteHolding' ? 'HOLDING_ID = ? AND ' : '';
    const binds = body.action === 'deleteHolding' ? [finite(data.id), user.id] : [user.id];
    await query(
      `DELETE FROM ${tableName('STOCK_ACCOUNT_HOLDINGS')} WHERE ${where}ACCOUNT_ID IN (SELECT ACCOUNT_ID FROM ${tableName('STOCK_ACCOUNTS')} WHERE USER_ID = ?)`,
      binds,
    );
    return json({ ok: true });
  }
  if (body.action === 'connectBotInstance') {
    const accountId = finite(data.accountId);
    const owned = await query(`SELECT ACCOUNT_ID FROM ${tableName('STOCK_ACCOUNTS')} WHERE ACCOUNT_ID = ? AND USER_ID = ? LIMIT 1`, [accountId, user.id]);
    if (!owned.length) throw Object.assign(new Error('본인 계좌에만 봇을 연결할 수 있습니다.'), { status: 403 });
    const now = new Date().toISOString();
    await query(
      `INSERT INTO ${tableName('BOT_INSTANCE')} (ACCOUNT_ID, BOT_ID, EXECUTION_MODE, ALLOCATED_AMOUNT, ALLOCATION_PCT, IS_ACTIVE, STARTED_AT) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountId, finite(data.botId), cleanText(data.executionMode) || 'SCENARIO', nullableFinite(data.allocatedAmount), nullableFinite(data.allocationPct), true, now],
    );
    const created = await query<{ BOT_INSTANCE_ID: number }>(
      `SELECT BOT_INSTANCE_ID FROM ${tableName('BOT_INSTANCE')} WHERE ACCOUNT_ID = ? AND BOT_ID = ? ORDER BY STARTED_AT DESC LIMIT 1`,
      [accountId, finite(data.botId)],
    );
    return json({ id: created[0]?.BOT_INSTANCE_ID ?? 0 });
  }
  if (body.action === 'disconnectBotInstance') {
    await query(
      `DELETE FROM ${tableName('BOT_INSTANCE')} WHERE BOT_INSTANCE_ID = ? AND ACCOUNT_ID IN (SELECT ACCOUNT_ID FROM ${tableName('STOCK_ACCOUNTS')} WHERE USER_ID = ?)`,
      [finite(data.id), user.id],
    );
    return json({ ok: true });
  }
  throw Object.assign(new Error('지원하지 않는 요청입니다.'), { status: 400 });
}

async function fetchHandler(request: Request) {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.get('view') === 'hmrc-trade') {
        return json({ data: await selectHmrcTradeSnapshot() }, 200, 'public, max-age=900');
      }
      const user = await userFrom(request);
      if (url.searchParams.get('view') === 'bots') {
        return json({ data: await selectBotSnapshot(url.searchParams.get('scenario') === '1') });
      }
      if (url.searchParams.get('view') === 'reports') {
        return json({ data: await selectReportSnapshot() }, 200, 'private, max-age=300');
      }
      const table = url.searchParams.get('table')?.toUpperCase() || '';
      return json({ data: await selectTable(table, user) });
    }
    if (request.method === 'POST') return handlePost(request, await userFrom(request));
    return json({ error: '허용되지 않은 메서드입니다.' }, 405);
  } catch (reason) {
    const error = reason as { message?: string; code?: string; status?: number };
    console.error('Snowflake API error', error.code, error.message);
    return json({ error: error.message || 'Snowflake 요청을 처리하지 못했습니다.', code: error.code }, error.status || 500);
  }
}

// Vite 프로젝트의 Vercel Node 런타임과 호환되는 전통적인 handler 형식입니다.
export default async function handler(request: LegacyRequest, response: LegacyResponse) {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (value != null) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  });
  const method = request.method || 'GET';
  const origin = `https://${headers.get('host') || 'localhost'}`;
  const url = new URL(request.url || '/api/data', origin);
  const body = method === 'GET' || method === 'HEAD' || request.body == null
    ? undefined
    : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const result = await fetchHandler(new Request(url, { method, headers, body }));
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.status(result.status).send(await result.text());
}
