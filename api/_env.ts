import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findEnvFile() {
  const starts = [process.cwd()];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // 일부 런타임은 import.meta.url이 없습니다. cwd 검색만 사용합니다.
  }
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = resolve(dir, '.env.local');
      if (existsSync(candidate)) return candidate;
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function unquote(value: string) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

// vercel dev의 서버 함수는 Vercel Development 환경에 등록된 변수만 받습니다.
// 로컬 .env.local에만 있는 Snowflake·Supabase 값은 여기서 채웁니다.
const file = findEnvFile();
if (file) {
  const loaded = new Set<string>();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    // 로컬에서는 .env.local을 단일 기준으로 사용합니다. vercel dev가 이전 프로젝트의
    // 원격 환경변수를 주입하더라도 현재 체크아웃의 Snowflake 키가 우선합니다.
    process.env[name] = unquote(trimmed.slice(separator + 1).trim());
    loaded.add(name);
  }
  // 두 키 변수가 동시에 있으면 _snowflake.ts는 BASE64를 우선합니다. 로컬 파일이
  // 한 형식만 선언한 경우 Vercel에서 주입된 다른 형식의 오래된 키를 제거합니다.
  if (loaded.has('SNOWFLAKE_PRIVATE_KEY') && !loaded.has('SNOWFLAKE_PRIVATE_KEY_BASE64')) {
    delete process.env.SNOWFLAKE_PRIVATE_KEY_BASE64;
  }
  if (loaded.has('SNOWFLAKE_PRIVATE_KEY_BASE64') && !loaded.has('SNOWFLAKE_PRIVATE_KEY')) {
    delete process.env.SNOWFLAKE_PRIVATE_KEY;
  }
}
