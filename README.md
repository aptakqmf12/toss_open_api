# 토스증권 계좌 현황판 대시보드

토스증권 Open API를 연동해 내 증권계좌의 **총 평가금액 / 평가손익 / 당일손익 / 종목별 보유현황·비중**을 보여주는 웹 대시보드입니다. (Next.js + TypeScript + Tailwind + Recharts)

## 빠른 시작 (mock 데이터)

자격증명 없이 UI를 먼저 확인할 수 있습니다.

```bash
npm install
npm run dev
# http://localhost:3000
```

`.env.local`의 `TOSS_USE_MOCK=true`(기본값)이면 더미 포트폴리오가 표시됩니다.

## 실제 계좌 연동

1. **토스증권 개발자 포털**(https://corp.tossinvest.com/ko/open-api)에서 앱을 등록하고
   `client_id` / `client_secret`을 발급받습니다.
2. `.env.local`을 채웁니다:

   ```env
   TOSS_CLIENT_ID=발급받은_client_id
   TOSS_CLIENT_SECRET=발급받은_client_secret
   TOSS_USE_MOCK=false
   # (선택) 특정 계좌만 보려면 accountSeq 지정
   # TOSS_ACCOUNT_SEQ=...
   ```

3. `npm run dev` 후 새로고침 버튼으로 실데이터를 불러옵니다.

> ⚠️ `client_secret`은 서버(`lib/toss.ts`, API 라우트)에서만 사용되며 브라우저로 절대 노출되지 않습니다. `.env.local`은 git에 커밋되지 않습니다.

## 구조

| 파일 | 역할 |
|------|------|
| `lib/toss.ts` | OAuth 토큰 발급·캐시, 계좌/보유현황 조회, 정규화 (서버 전용) |
| `lib/mock.ts` | 더미 포트폴리오 데이터 |
| `lib/types.ts` | 대시보드용 정규화 타입 |
| `lib/format.ts` | 통화/퍼센트/색상 포맷 유틸 |
| `app/api/portfolio/route.ts` | 대시보드용 집계 데이터 API |
| `app/page.tsx` | 대시보드 화면 (요약카드·차트·테이블·새로고침) |
| `app/components/AllocationChart.tsx` | 자산배분 도넛 차트 |

## 사용 API (토스증권 Open API)

- `POST /oauth2/token` — OAuth 2.0 Client Credentials 토큰 발급
- `GET /api/v1/accounts` — 계좌 목록 (`accountSeq` 획득)
- `GET /api/v1/holdings` — 보유 현황 (헤더 `X-Tossinvest-Account: {accountSeq}` 필요)

> 보유현황 응답의 정확한 JSON 필드 구조는 자격증명 발급 후
> `https://openapi.tossinvest.com/openapi-docs/latest/openapi.json` 으로 최종 확인이 필요합니다.
> 실응답과 다를 경우 `lib/toss.ts`의 `RawHoldings` 타입과 `normalizeHoldings()`만 수정하면 됩니다.
