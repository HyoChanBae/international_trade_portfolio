import './_env.js';
import { createPrivateKey } from 'node:crypto';
import type snowflake from 'snowflake-sdk';

type Row = Record<string, unknown>;
type SnowflakeSdk = Pick<typeof import('snowflake-sdk'), 'createConnection'>;

let connectionPromise: Promise<snowflake.Connection> | null = null;
let sdkPromise: Promise<SnowflakeSdk> | null = null;

async function snowflakeSdk() {
  if (!sdkPromise) {
    // SQL/JWT 연결에 필요 없는 선택적 native minicore를 Vercel에서 로드하지 않습니다.
    process.env.SNOWFLAKE_DISABLE_MINICORE = 'true';
    sdkPromise = import('snowflake-sdk').then((module) => {
      const commonJsDefault = (module as unknown as { default?: SnowflakeSdk }).default;
      return commonJsDefault ?? module;
    });
  }
  return sdkPromise;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Vercel 환경변수 ${name}가 설정되지 않았습니다.`);
  return value;
}

function privateKeyPem() {
  const base64 = process.env.SNOWFLAKE_PRIVATE_KEY_BASE64?.trim();
  const inline = process.env.SNOWFLAKE_PRIVATE_KEY?.trim();
  if (!base64 && !inline) {
    throw new Error('Vercel 환경변수 SNOWFLAKE_PRIVATE_KEY 또는 SNOWFLAKE_PRIVATE_KEY_BASE64가 필요합니다.');
  }
  const key = base64
    ? Buffer.from(base64, 'base64').toString('utf8')
    : inline!.replace(/\\n/g, '\n');
  const parsed = createPrivateKey({
    key,
    format: 'pem',
    passphrase: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || undefined,
  });
  return parsed.export({ format: 'pem', type: 'pkcs8' }).toString();
}

async function connect() {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const sdk = await snowflakeSdk();
      return new Promise<snowflake.Connection>((resolve, reject) => {
        const host = process.env.SNOWFLAKE_HOST?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
        const connection = sdk.createConnection({
          account: required('SNOWFLAKE_ACCOUNT'),
          ...(host ? { host } : {}),
          username: required('SNOWFLAKE_USERNAME'),
          authenticator: 'SNOWFLAKE_JWT',
          privateKey: privateKeyPem(),
          warehouse: required('SNOWFLAKE_WAREHOUSE'),
          database: required('SNOWFLAKE_DATABASE'),
          schema: required('SNOWFLAKE_SCHEMA'),
          role: process.env.SNOWFLAKE_ROLE?.trim() || undefined,
          application: 'LUKA_VERCEL',
        });
        connection.connect((error: snowflake.SnowflakeError | undefined) => {
          if (error) reject(error);
          else resolve(connection);
        });
      });
    })().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

export async function query<T extends Row = Row>(sqlText: string, binds: unknown[] = []) {
  const connection = await connect();
  return new Promise<T[]>((resolve, reject) => {
    connection.execute({
      sqlText,
      binds: binds as snowflake.Binds,
      complete(error, _statement, rows) {
        if (error) reject(error);
        else resolve((rows ?? []) as T[]);
      },
    });
  });
}

const identifier = (value: string, envName: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${envName}에 사용할 수 없는 식별자가 포함되어 있습니다.`);
  }
  return `"${value.toUpperCase()}"`;
};

export function tableName(table: string) {
  return [
    identifier(required('SNOWFLAKE_DATABASE'), 'SNOWFLAKE_DATABASE'),
    identifier(required('SNOWFLAKE_SCHEMA'), 'SNOWFLAKE_SCHEMA'),
    identifier(table, 'table'),
  ].join('.');
}
