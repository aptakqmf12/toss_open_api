import "server-only";
import type { PortfolioSummary, HoldingItem, ExchangeRate, OrderInfo } from "./types";
import { normalizeOrderInfo } from "./orders";

// ─────────────────────────────────────────────────────────────
// 토스증권 Open API 연동 레이어 (서버 전용)
//
// 인증: OAuth 2.0 Client Credentials Grant
//   POST {BASE}/oauth2/token  (application/x-www-form-urlencoded)
//   body: grant_type=client_credentials & client_id & client_secret
//
// 계좌:    GET {BASE}/api/v1/accounts        -> accountSeq 획득 ({ result: [...] })
// 보유현황: GET {BASE}/api/v1/holdings        (header: X-Tossinvest-Account: {accountSeq})
//
// 응답 구조는 공식 OpenAPI 스펙 기준으로 맞췄다.
//   https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
// 금액 필드는 단일 숫자가 아니라 통화별 객체({ krw, usd })로 내려오며,
// 일부는 { amount: { krw, usd } } 처럼 한 단계 더 중첩된다. money() 헬퍼가
// 숫자 / { amount } / { krw, usd } 형태를 모두 흡수한다.
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.TOSS_API_BASE_URL ?? "https://openapi.tossinvest.com";

export class TossApiError extends Error {
  constructor(message: string, readonly status?: number, readonly detail?: unknown) {
    super(message);
    this.name = "TossApiError";
  }
}

// ── 토큰 캐시 (모듈 레벨 메모리 캐시) ──────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // 이미 발급받은 access_token 을 직접 주입한 경우 그대로 사용.
  // (client_secret 없이 빠르게 실데이터를 확인할 때 유용. 단, 만료되면 직접 갱신 필요)
  if (process.env.TOSS_ACCESS_TOKEN) {
    return process.env.TOSS_ACCESS_TOKEN;
  }

  const now = Date.now();
  // 만료 30초 전까지는 재사용 (rate limit 보호)
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) {
    return cachedToken.value;
  }

  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new TossApiError(
      "TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 환경변수가 설정되지 않았습니다.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new TossApiError(
      `토큰 발급 실패 (${res.status})`,
      res.status,
      await safeJson(res),
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresIn = (json.expires_in ?? 3600) * 1000;
  cachedToken = { value: json.access_token, expiresAt: now + expiresIn };
  return json.access_token;
}

async function authedFetch(
  path: string,
  init?: RequestInit & { accountSeq?: string | number },
): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.accountSeq != null)
    headers["X-Tossinvest-Account"] = String(init.accountSeq);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new TossApiError(
      `${path} 요청 실패 (${res.status})`,
      res.status,
      await safeJson(res),
    );
  }
  return res.json();
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

// ── 계좌 목록 ────────────────────────────────────────────────
interface RawAccount {
  accountNo: string;
  accountSeq: string | number;
  accountType: string;
}

async function getAccounts(): Promise<RawAccount[]> {
  const data = (await authedFetch("/api/v1/accounts")) as
    | { result?: RawAccount[]; accounts?: RawAccount[] }
    | RawAccount[];
  // 스펙상 { result: [...] } 형태. 방어적으로 배열 / { accounts } 도 허용.
  const list = Array.isArray(data) ? data : data.result ?? data.accounts ?? [];
  if (list.length === 0) throw new TossApiError("조회된 계좌가 없습니다.");
  return list;
}

// 사용할 계좌 선택: TOSS_ACCOUNT_SEQ 우선, 없으면 첫 계좌.
function resolveAccount(accounts: RawAccount[]): RawAccount {
  const preferred = process.env.TOSS_ACCOUNT_SEQ;
  return (
    (preferred && accounts.find((a) => String(a.accountSeq) === preferred)) ||
    accounts[0]
  );
}

// ── 보유 현황 원시 응답 (실응답 기준) ────────────────────────
// 모든 금액은 문자열("322.39")로 내려온다. rate 는 소수(-0.0086 = -0.86%).
// 합계 금액은 통화별 버킷({ krw, usd })으로 나뉘며, 단일 통화 계좌는 반대쪽이 "0".
// 종목 레벨 금액은 해당 종목 통화 기준의 단일 스칼라다.
type Money = string | number | null | undefined;
type CurrencyAmount = { krw?: Money; usd?: Money };
type Cur = "KRW" | "USD";

interface RawHoldingItem {
  symbol: string;
  name: string;
  marketCountry?: string;
  currency?: string;
  quantity?: Money;
  lastPrice?: Money;
  averagePurchasePrice?: Money;
  marketValue?: { purchaseAmount?: Money; amount?: Money; amountAfterCost?: Money };
  profitLoss?: { amount?: Money; rate?: Money; rateAfterCost?: Money };
  dailyProfitLoss?: { amount?: Money; rate?: Money };
  cost?: unknown;
}
interface RawHoldings {
  totalPurchaseAmount: CurrencyAmount;
  marketValue: { amount: CurrencyAmount; amountAfterCost?: CurrencyAmount };
  profitLoss: { amount: CurrencyAmount; rate?: Money; rateAfterCost?: Money };
  dailyProfitLoss: { amount: CurrencyAmount; rate?: Money };
  items: RawHoldingItem[];
}

async function getHoldings(accountSeq: string | number): Promise<RawHoldings> {
  const data = (await authedFetch("/api/v1/holdings", { accountSeq })) as
    | { result?: RawHoldings }
    | RawHoldings;
  return (data && "result" in data && data.result ? data.result : data) as RawHoldings;
}

// ── 환율 조회 ────────────────────────────────────────────────
// GET /api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW
//   -> { result: { rate: "1520.3", validFrom, validUntil, ... } }
// rate limit 그룹이 MARKET_INFO 라 과호출 시 429. validUntil(없으면 60초)까지 캐시.
interface RawExchangeRate {
  baseCurrency?: string;
  quoteCurrency?: string;
  rate?: Money;
  midRate?: Money;
  validFrom?: string;
  validUntil?: string;
}
const fxCache = new Map<string, { rate: number; asOf: string; expiresAt: number }>();

async function getExchangeRate(base: Cur, quote: Cur): Promise<ExchangeRate | undefined> {
  if (base === quote) return undefined;
  const key = `${base}-${quote}`;
  const now = Date.now();
  const hit = fxCache.get(key);
  if (hit && hit.expiresAt > now) {
    return { base, quote, rate: hit.rate, asOf: hit.asOf };
  }
  try {
    const data = (await authedFetch(
      `/api/v1/exchange-rate?baseCurrency=${base}&quoteCurrency=${quote}`,
    )) as { result?: RawExchangeRate } | RawExchangeRate;
    const r = (data && "result" in data && data.result ? data.result : data) as RawExchangeRate;
    const rate = num(r.rate);
    if (rate <= 0) return undefined;
    const asOf = r.validFrom ?? new Date().toISOString();
    const expiresAt = r.validUntil ? Date.parse(r.validUntil) : now + 60_000;
    fxCache.set(key, { rate, asOf, expiresAt });
    return { base, quote, rate, asOf };
  } catch {
    // 환율 조회 실패해도 포트폴리오 자체는 그대로 보여준다 (토글만 비활성).
    return undefined;
  }
}

// 숫자 / 숫자형 문자열("325.19") 을 숫자로. 파싱 불가 시 0.
function num(v: Money): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 통화 버킷({ krw, usd })에서 표시 통화 값 추출.
function pick(a: CurrencyAmount | undefined, cur: Cur): number {
  if (!a) return 0;
  return num(cur === "USD" ? a.usd : a.krw);
}

// 표시(기준) 통화 결정: 평가금액이 잡히는 통화를 사용하고 KRW 를 우선한다.
// 단일 통화 계좌면 반대 통화 버킷이 "0" 이므로 값이 있는 쪽을 고른다.
function detectCurrency(raw: RawHoldings): Cur {
  if (pick(raw.marketValue?.amount, "KRW") !== 0) return "KRW";
  if (pick(raw.marketValue?.amount, "USD") !== 0) return "USD";
  return raw.items?.[0]?.currency === "USD" ? "USD" : "KRW";
}

// ── 원시 → 정규화 ────────────────────────────────────────────
function normalizeHoldings(
  account: RawAccount,
  raw: RawHoldings,
): PortfolioSummary {
  const currency = detectCurrency(raw);
  const totalMarketValue = pick(raw.marketValue?.amount, currency);

  const items: HoldingItem[] = (raw.items ?? []).map((r) => {
    const quantity = num(r.quantity);
    const averagePurchasePrice = num(r.averagePurchasePrice);
    const lastPrice = num(r.lastPrice);
    // 평가/매입금액: API 값이 있으면 신뢰, 없으면 수량×단가로 계산.
    const marketValue =
      r.marketValue?.amount != null ? num(r.marketValue.amount) : lastPrice * quantity;
    const purchaseAmount =
      r.marketValue?.purchaseAmount != null
        ? num(r.marketValue.purchaseAmount)
        : averagePurchasePrice * quantity;
    const profitLoss =
      r.profitLoss?.amount != null ? num(r.profitLoss.amount) : marketValue - purchaseAmount;
    // rate 는 소수(-0.0086) → % 로 변환. 없으면 직접 계산.
    const profitLossRate =
      r.profitLoss?.rate != null
        ? num(r.profitLoss.rate) * 100
        : purchaseAmount === 0
          ? 0
          : (profitLoss / purchaseAmount) * 100;
    return {
      symbol: r.symbol ?? "",
      name: r.name ?? r.symbol ?? "",
      quantity,
      averagePurchasePrice,
      lastPrice,
      marketValue,
      purchaseAmount,
      profitLoss,
      profitLossRate,
      weight: totalMarketValue === 0 ? 0 : (marketValue / totalMarketValue) * 100,
      currency: r.currency ?? currency,
    };
  });

  return {
    accountNo: maskAccountNo(account.accountNo),
    totalMarketValue,
    totalPurchaseAmount: pick(raw.totalPurchaseAmount, currency),
    totalProfitLoss: pick(raw.profitLoss?.amount, currency),
    totalProfitLossRate: num(raw.profitLoss?.rate) * 100,
    dailyProfitLoss: pick(raw.dailyProfitLoss?.amount, currency),
    currency,
    items,
    updatedAt: new Date().toISOString(),
  };
}

function maskAccountNo(accountNo: string): string {
  if (accountNo.length <= 4) return accountNo;
  return accountNo.slice(0, 4) + "*".repeat(accountNo.length - 4);
}

// ── 주문 전 조회 ─────────────────────────────────────────────
export async function getOrderInfo(symbol: string): Promise<OrderInfo> {
  const accounts = await getAccounts();
  const account = resolveAccount(accounts);
  const data = await authedFetch(
    `/api/v1/order-info?symbol=${encodeURIComponent(symbol)}&side=BUY`,
    { accountSeq: account.accountSeq },
  );
  return normalizeOrderInfo(data, symbol);
  // ⚠️ probe 결과 order-info 에 현재가가 없으면 holdings 의 lastPrice 로 보강한다.
}

// ── 시장가 매수 주문 전송 ────────────────────────────────────
export async function placeBuyOrder(req: {
  symbol: string;
  quantity: number;
  clientOrderId: string;
}): Promise<{ orderId: string; clientOrderId: string }> {
  const accounts = await getAccounts();
  const account = resolveAccount(accounts);
  const data = (await authedFetch("/api/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientOrderId: req.clientOrderId,
      symbol: req.symbol,
      side: "BUY",
      orderType: "MARKET",
      quantity: String(req.quantity), // 토스 금액/수량 필드는 문자열
    }),
    accountSeq: account.accountSeq,
  })) as { result?: { orderId: string; clientOrderId?: string } } | { orderId: string };

  const result = (data && "result" in data && data.result
    ? data.result
    : data) as { orderId: string; clientOrderId?: string };
  return { orderId: result.orderId, clientOrderId: result.clientOrderId ?? req.clientOrderId };
}

// ── 공개 진입점 ──────────────────────────────────────────────
export async function getPortfolio(): Promise<PortfolioSummary> {
  const accounts = await getAccounts();
  const account = resolveAccount(accounts);

  const raw = await getHoldings(account.accountSeq);
  const summary = normalizeHoldings(account, raw);

  // 기준 통화(계좌 통화)의 반대 통화 환율을 붙여 클라이언트의 원화/달러 토글을 지원.
  const base = summary.currency as Cur;
  const quote: Cur = base === "USD" ? "KRW" : "USD";
  const fx = await getExchangeRate(base, quote);
  if (fx) summary.exchangeRate = fx;

  return summary;
}
