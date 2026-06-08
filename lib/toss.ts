import "server-only";
import type { PortfolioSummary, HoldingItem } from "./types";
import { buildMockPortfolio } from "./mock";

// ─────────────────────────────────────────────────────────────
// 토스증권 Open API 연동 레이어 (서버 전용)
//
// 인증: OAuth 2.0 Client Credentials Grant
//   POST {BASE}/oauth2/token  (application/x-www-form-urlencoded)
//   body: grant_type=client_credentials & client_id & client_secret
//
// 계좌:    GET {BASE}/api/v1/accounts        -> accountSeq 획득
// 보유현황: GET {BASE}/api/v1/holdings        (header: X-Tossinvest-Account: {accountSeq})
//
// ⚠️ 실제 JSON 응답 필드명/중첩 구조는 자격증명 발급 후
//    https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
//    으로 최종 확인이 필요하다. 아래 파서는 문서 요약 기준의 추정 구조이며,
//    실데이터 확인 시 normalizeHoldings()만 손보면 된다.
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
  init?: RequestInit & { accountSeq?: string },
): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.accountSeq) headers["X-Tossinvest-Account"] = init.accountSeq;

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
  accountSeq: string;
  accountType: string;
}

async function getAccounts(): Promise<RawAccount[]> {
  const data = (await authedFetch("/api/v1/accounts")) as
    | { accounts?: RawAccount[] }
    | RawAccount[];
  // 응답이 배열 자체일 수도, { accounts: [...] } 형태일 수도 있어 양쪽 처리
  const list = Array.isArray(data) ? data : data.accounts ?? [];
  if (list.length === 0) throw new TossApiError("조회된 계좌가 없습니다.");
  return list;
}

// ── 보유 현황 원시 응답 (추정 구조) ──────────────────────────
interface RawHoldingItem {
  symbol?: string;
  stockCode?: string;
  name?: string;
  stockName?: string;
  quantity: number;
  averagePurchasePrice: number;
  lastPrice: number;
  currency?: string;
}
interface RawHoldings {
  totalPurchaseAmount: number;
  marketValue: { amount: number };
  profitLoss: { amount: number; rate: number };
  dailyProfitLoss: number | { amount: number };
  currency?: string;
  items: RawHoldingItem[];
}

async function getHoldings(accountSeq: string): Promise<RawHoldings> {
  return (await authedFetch("/api/v1/holdings", { accountSeq })) as RawHoldings;
}

// ── 원시 → 정규화 ────────────────────────────────────────────
function normalizeHoldings(
  account: RawAccount,
  raw: RawHoldings,
): PortfolioSummary {
  const totalMarketValue = raw.marketValue.amount;
  const currency = raw.currency ?? "KRW";

  const items: HoldingItem[] = (raw.items ?? []).map((r) => {
    const quantity = r.quantity;
    const averagePurchasePrice = r.averagePurchasePrice;
    const lastPrice = r.lastPrice;
    const marketValue = lastPrice * quantity;
    const purchaseAmount = averagePurchasePrice * quantity;
    const profitLoss = marketValue - purchaseAmount;
    const profitLossRate = purchaseAmount === 0 ? 0 : (profitLoss / purchaseAmount) * 100;
    return {
      symbol: r.symbol ?? r.stockCode ?? "",
      name: r.name ?? r.stockName ?? r.symbol ?? r.stockCode ?? "",
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

  const dailyProfitLoss =
    typeof raw.dailyProfitLoss === "number"
      ? raw.dailyProfitLoss
      : raw.dailyProfitLoss?.amount ?? 0;

  return {
    accountNo: maskAccountNo(account.accountNo),
    totalMarketValue,
    totalPurchaseAmount: raw.totalPurchaseAmount,
    totalProfitLoss: raw.profitLoss.amount,
    totalProfitLossRate: raw.profitLoss.rate,
    dailyProfitLoss,
    currency,
    items,
    updatedAt: new Date().toISOString(),
    isMock: false,
  };
}

function maskAccountNo(accountNo: string): string {
  if (accountNo.length <= 4) return accountNo;
  return accountNo.slice(0, 4) + "*".repeat(accountNo.length - 4);
}

// ── 공개 진입점 ──────────────────────────────────────────────
export async function getPortfolio(): Promise<PortfolioSummary> {
  if (process.env.TOSS_USE_MOCK === "true") {
    return buildMockPortfolio();
  }

  const accounts = await getAccounts();
  const preferred = process.env.TOSS_ACCOUNT_SEQ;
  const account =
    (preferred && accounts.find((a) => a.accountSeq === preferred)) || accounts[0];

  const raw = await getHoldings(account.accountSeq);
  return normalizeHoldings(account, raw);
}
