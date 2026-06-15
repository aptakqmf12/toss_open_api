# 시장가 매수 기능 설계 (v1)

- 날짜: 2026-06-15
- 범위: **시장가 매수만**, 보유 종목 대상, 주문 전 확인 + 1회 주문 한도 안전장치
- 전제: 기존 read-only 포트폴리오 대시보드(`toss_api`)에 실거래(매수) 기능을 추가한다. 실제 돈이 움직이므로 안전장치를 서버가 강제한다.

## 1. 목표와 비목표

**목표 (v1)**
- 보유 종목에 한해 **시장가(MARKET) 매수** 주문을 넣을 수 있다.
- 주문 전 **주문가능금액·현재가·수수료**를 확인하고, **확인 단계**를 거친다.
- **1회 주문 한도 금액**을 서버에서 강제해 오입력/버그로 인한 대금 주문을 차단한다.

**비목표 (v1에서 제외)**
- 매도, 주문 취소/정정 (다음 단계).
- 지정가(LIMIT) 주문 (시장가만).
- 임의 종목 매수 / 종목 검색 (보유 종목에서만).
- 별도 주문내역(체결/미체결) 화면. 시장가는 즉시 체결되고 토스 앱에서 확인 가능하므로, 결과 토스트 + 포트폴리오 새로고침으로 갈음한다.

## 2. 의사결정 요약

| 항목 | 결정 |
|------|------|
| 기능 범위 | 매수만 먼저 |
| 안전장치 | 주문 전 확인 단계 + 1회 주문 한도 금액 |
| 주문 유형 | 시장가(MARKET)만 |
| 종목 선택 | 보유 종목에서만 추가매수 |
| 아키텍처 | 안 A — 서버 권위(authoritative) 단일 확인 흐름 |

## 3. 토스 Open API 사용 엔드포인트

- `GET /api/v1/order-info?symbol=&side=BUY` — 주문 전 거래 가능 정보(주문가능금액, 매도가능수량, 수수료 등).
- `POST /api/v1/orders` — 매수/매도 주문 생성.
  - 요청: `clientOrderId`(opt), `symbol`(req), `side`(BUY), `orderType`(MARKET), `quantity`(req).
  - 응답: `{ result: { orderId, clientOrderId } }`.
- 인증: 기존과 동일한 OAuth 2.0 client_credentials + `Authorization: Bearer` + `X-Tossinvest-Account` 헤더.
- 레이트리밋 그룹: `ORDER`(주문 생성), `ORDER_INFO`(주문 전 조회). 수치 한도는 문서 미명시 → 과호출 주의.

> 주: 취소/정정 엔드포인트는 스펙 설명에는 존재하나 v1 범위 밖. 구현 착수 시 정확한 경로 재확인.

## 4. 아키텍처 (안 A — 서버 권위)

클라이언트는 편의를 위한 미리보기만 담당하고, **모든 검증(인증·한도·매수가능)은 서버가 최종 결정**한다. 클라이언트가 보낸 금액/현재가는 신뢰하지 않고, 주문 확정 시 서버가 order-info를 **재조회**한다.

### 데이터 흐름 (한 종목 매수)

```
[보유종목 "매수" 클릭]
      ▼
모달 오픈 → GET /api/order-info?symbol=&side=BUY  (서버 경유, isAuthed)
      ▼
표시: 현재가 · 주문가능금액 · 수수료율 · 1회 한도
      ▼
[수량 입력] → 예상 체결금 ≈ 현재가 × 수량 (클라 미리보기)
      ▼
[매수] → 확인 요약 (금액·수량·예상 체결금·수수료)
      ▼
[최종 확인] → POST /api/orders { symbol, quantity }
      │  서버 강제 검증:
      │    1) isAuthed
      │    2) order-info 재조회 (현재가·주문가능금액)
      │    3) 예상금액 ≤ MAX_ORDER_AMOUNT
      │    4) 예상금액 ≤ 주문가능금액
      │  통과 → POST /api/v1/orders (side=BUY, orderType=MARKET, clientOrderId)
      ▼
성공: orderId 반환 → 토스트 → 포트폴리오 자동 새로고침
```

## 5. 변경/추가 파일

```
lib/toss.ts                         → getOrderInfo(), placeOrder(), resolveAccount() 추가
lib/types.ts                        → OrderInfo, BuyOrderRequest, OrderResult 타입 추가
app/api/order-info/route.ts         → GET  (주문 전 조회)
app/api/orders/route.ts             → POST (시장가 매수 + 한도/검증 강제)
app/page.tsx                        → 보유 종목 행/카드에 "매수" 버튼
app/components/BuyOrderModal.tsx    → 수량 입력 → 확인 → 결과 모달
.env.example                        → MAX_ORDER_AMOUNT 문서화
```

## 6. 서버 레이어 상세

### 6.1 타입 (`lib/types.ts`)

```ts
export interface OrderInfo {
  symbol: string;
  side: "BUY";
  lastPrice: number;        // 현재가
  buyableAmount: number;    // 주문가능금액(현금 기반)
  commissionRate?: number;  // 수수료율 (있으면)
  currency: string;
}

export interface BuyOrderRequest {
  symbol: string;
  quantity: number;
}

export interface OrderResult {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  quantity: number;
  estimatedAmount: number;  // 전송 시점 예상 체결금
}
```

### 6.2 `lib/toss.ts`

- `resolveAccount()`: 현재 `getPortfolio` 안에 인라인된 계좌 선택 로직(`TOSS_ACCOUNT_SEQ` 우선 → 첫 계좌)을 공용 헬퍼로 추출해 재사용.
- `getOrderInfo(symbol): Promise<OrderInfo>`: `GET /api/v1/order-info?symbol=&side=BUY` 호출 후 기존 `num()`/`pick()` 헬퍼로 정규화.
- `placeOrder(accountSeq, body): Promise<{orderId, clientOrderId}>`: `POST /api/v1/orders` 호출 후 `{ result }` 정규화.
- 금액 필드는 기존 `money()`/`num()`/`pick()` 헬퍼로 동일하게 흡수(통화별 버킷·문자열 금액 대응).

### 6.3 `app/api/order-info/route.ts` (GET)

1. `isAuthed()` → 아니면 401.
2. `symbol` 쿼리 검증 → 없으면 400.
3. `getOrderInfo(symbol)` → JSON 반환.
4. `export const dynamic = "force-dynamic"`.

### 6.4 `app/api/orders/route.ts` (POST) — 안전장치의 핵심

```
1. isAuthed() → 아니면 401
2. body 파싱·검증: symbol(문자열), quantity(양의 정수) → 아니면 400
3. getOrderInfo(symbol) 재조회 (서버 권위 현재가·주문가능금액)
4. estimatedAmount = lastPrice × quantity
5. estimatedAmount > MAX_ORDER_AMOUNT  → 422 "1회 한도 초과"
6. estimatedAmount > buyableAmount     → 422 "주문가능금액 초과"
7. clientOrderId = crypto.randomUUID()  (더블클릭/재시도 중복 방지)
8. placeOrder(...) → OrderResult 반환
   실패 시 TossApiError → 상태코드 그대로 전달
```

### 6.5 환경변수

- `MAX_ORDER_AMOUNT` (계좌 통화 기준, 예: `1000000`). **미설정 시 무제한이 되면 위험하므로 보수적 기본값(예: 100,000)** 적용. `.env.example`에 문서화.

## 7. 프론트엔드 UI

### 7.1 매수 버튼 (`app/page.tsx`)

- 데스크톱 테이블: 우측에 "매수" 버튼 열 추가.
- 모바일 카드: 하단에 "매수" 버튼.
- 클릭 시 해당 종목(symbol, name)을 `BuyOrderModal`로 전달.

### 7.2 `app/components/BuyOrderModal.tsx` — 3단계 상태머신

- **1. 입력**: 모달 오픈 시 `GET /api/order-info` 호출(로딩 표시). 현재가·주문가능금액·1회 한도 표시. 수량 입력(+/- 스텝) → 실시간 예상 체결금. 한도/주문가능금액 초과 시 경고 + "매수" 비활성화.
- **2. 확인**: "○○를 N주 시장가 매수" 요약(예상 체결금·예상 수수료·주문 후 예상 잔액). "시장가라 실제 체결가는 달라질 수 있어요" 안내. [취소] / [확정 매수] — 확정 클릭 즉시 비활성화(더블클릭 방지).
- **3. 결과**: 성공 시 ✅ "주문 접수됨(주문번호 …)" → [확인] 시 모달 닫고 부모 `load()` 호출(포트폴리오 새로고침). 실패 시 ⚠️ 서버 메시지 표시 + [다시 시도]/[닫기].

### 7.3 디자인 톤

- 기존 다크 테마(`bg-gray-900/60`, `rounded-2xl`, blue 액센트) 유지.
- **매수 확정 버튼은 빨강 계열** — "되돌릴 수 없는 행동" 시각적 구분.
- 모달: 오버레이 + ESC/바깥클릭 닫기(단, 전송 중에는 닫기 잠금). 로딩·에러·비활성 상태 모두 명시.

## 8. 에러 처리

- 기존 `TossApiError` 패턴 재사용 — status 코드 그대로 클라이언트 전달.
- **IP 화이트리스트**: 주문 엔드포인트도 동일하게 403 `IP not allowed` 가능. 배포 서버 IP(`13.209.205.86`)는 등록됨. **로컬 개발 IP는 별도 등록 필요** → 모달에서 403은 "IP 미등록" 안내.
- 상태별 사용자 친화 메시지: 한도 초과(422), 주문가능금액 부족(422), 잘못된 입력(400), 미인증(401).
- 토스 주문 API 5xx/타임아웃: **자동 재시도 안 함**(중복주문 위험) → "결과 불명, 토스 앱에서 확인" 안내.

## 9. 테스트 전략 (⚠️ 핵심 리스크)

- 토스 Open API에 **샌드박스가 없으면 모든 주문이 실제 체결**된다. 따라서:
  - **단위 테스트는 `fetch`를 모킹** — 실제 주문 엔드포인트는 테스트에서 절대 호출하지 않는다.
  - 검증 로직(한도 체크, 금액 계산, 입력 검증, order-info 정규화)은 순수 함수로 분리해 모킹 없이 테스트.
  - 수동 검증은 **최소 단위(1주, 저가 종목)**로 1회만, 사용자 승인 하에.
- 샌드박스/모의투자 환경 존재 여부는 구현 착수 시 토스 문서에서 먼저 확인(있으면 `TOSS_API_BASE_URL`로 분리).

**검증 체크리스트(구현 후)**
- 한도 초과 주문이 422로 차단되는가.
- 미인증 요청이 401인가.
- order-info 정규화가 KRW/USD 모두 맞는가.
- 더블클릭 시 주문이 한 번만 나가는가(clientOrderId).

## 10. 열린 항목(구현 착수 시 확인)

- 토스 order-info 실제 응답 필드명(`buyableAmount` 등) — `scripts/probe.mjs`에 order-info 호출을 추가해 실응답 확인 후 정규화 매핑 확정.
- 샌드박스/모의투자 환경 유무.
- 시장가 매수 시 `quantity` 외 `orderAmount` 필요 여부(국내주식은 수량 기반).
