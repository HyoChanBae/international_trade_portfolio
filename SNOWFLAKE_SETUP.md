# Snowflake + Vercel 연결 설정

앱 데이터는 브라우저에서 Snowflake로 직접 접속하지 않습니다. Vercel의 Node.js 함수인
`/api/data`가 private key로 Snowflake에 접속하고, 브라우저는 같은 도메인의 API만 호출합니다.
private key와 Snowflake 계정 정보는 Vite 번들에 포함되지 않습니다.

## 1. Vercel 환경변수

Vercel 프로젝트의 **Settings > Environment Variables**에 아래 값을 추가합니다.

| 변수 | 내용 |
| --- | --- |
| `SNOWFLAKE_ACCOUNT` | `orgname-account_name` 형식의 계정 식별자 |
| `SNOWFLAKE_USERNAME` | public key가 등록된 서비스 사용자 |
| `SNOWFLAKE_WAREHOUSE` | 앱 쿼리에 사용할 warehouse |
| `SNOWFLAKE_DATABASE` | Luka 테이블이 있는 database |
| `SNOWFLAKE_SCHEMA` | Luka 테이블이 있는 schema |
| `SNOWFLAKE_ROLE` | 테이블 조회/수정 권한이 있는 role |
| `SNOWFLAKE_PRIVATE_KEY` | PKCS#8 PEM 전체. 실제 줄바꿈과 `\n` 문자열 모두 지원 |
| `SNOWFLAKE_PRIVATE_KEY_BASE64` | PEM 파일의 base64 값. 위 변수 대신 사용 가능 |
| `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` | 암호화된 키인 경우에만 입력 |

기존 `SUPABASE_URL`, `SUPABASE_ANON_KEY`는 DB 접근에는 사용하지 않으며 기존 로그인 세션의
본인 확인에만 사용합니다. `SUPABASE_SCHEMA`는 삭제해도 됩니다.

`SNOWFLAKE_PRIVATE_KEY`를 포함한 모든 Snowflake 변수에는 `VITE_` 접두사를 붙이지 마세요.
환경변수를 바꾼 뒤에는 기존 배포가 아니라 새 배포를 생성해야 적용됩니다.

## 2. Snowflake 권한

`SNOWFLAKE_ROLE`에는 database/schema의 `USAGE`, warehouse의 `USAGE`, 조회 대상 테이블의
`SELECT`가 필요합니다. 계좌와 봇 연결을 저장하려면 아래 테이블에 `INSERT`, `UPDATE`, `DELETE`도
필요합니다.

- `STOCK_ACCOUNTS`
- `STOCK_ACCOUNT_HOLDINGS`
- `BOT_INSTANCE`

`ACCOUNT_ID`, `HOLDING_ID`, `BOT_INSTANCE_ID`는 기존 앱과 동일하게 Snowflake 테이블에서 자동으로
생성되는 기본값 또는 sequence가 있어야 합니다.

## 3. 로컬 실행

`.env.example`을 참고해 `.env.local`에 값을 입력하고 Vercel CLI로 실행합니다.

```bash
npm run dev:vercel
```

일반 `npm run dev`는 Vite 정적 개발 서버만 실행하므로 `/api` 함수까지 시험하려면
`npm run dev:vercel`을 사용합니다.

