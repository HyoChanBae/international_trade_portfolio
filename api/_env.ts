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
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || process.env[name]?.trim()) continue;
    process.env[name] = unquote(trimmed.slice(separator + 1).trim());
  }
}
