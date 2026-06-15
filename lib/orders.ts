// 매수 주문의 순수 검증/정규화 로직. fetch 없음 → 모킹 없이 테스트 가능.
import type { OrderInfo, BuyOrderRequest } from "./types";

export const DEFAULT_MAX_ORDER_AMOUNT = 100_000;

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

type Money = string | number | null | undefined;
type CurrencyAmount = { krw?: Money; usd?: Money };

// 숫자/숫자형 문자열 → 숫자. 파싱 불가 시 0. (lib/toss.ts num() 과 동일 규칙)
function toNumber(v: Money): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 스칼라 | { amount } | { krw, usd } 형태를 모두 흡수해 통화별 값 추출.
function pickAmount(v: unknown, currency: string): number {
  if (v == null) return 0;
  if (typeof v === "number" || typeof v === "string") return toNumber(v);
  const obj = v as CurrencyAmount & { amount?: Money };
  if (obj.amount != null) return toNumber(obj.amount);
  return toNumber(currency === "USD" ? obj.usd : obj.krw);
}

// 클라이언트 매수 요청 검증. 가격/금액은 받지 않는다(서버가 결정).
export function parseBuyOrderInput(raw: unknown): BuyOrderRequest {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const symbol = obj.symbol;
  const quantity = obj.quantity;
  if (typeof symbol !== "string" || symbol.trim() === "") {
    throw new OrderValidationError("symbol 이 필요합니다.");
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    throw new OrderValidationError("quantity 는 양의 정수여야 합니다.");
  }
  return { symbol: symbol.trim(), quantity };
}

// 1회 한도 + 주문가능금액 검증. 서버가 강제하는 핵심 안전장치.
export function checkBuyLimits(params: {
  lastPrice: number;
  quantity: number;
  buyableAmount: number;
  maxOrderAmount: number;
}):
  | { ok: true; estimatedAmount: number }
  | { ok: false; status: number; message: string } {
  const { lastPrice, quantity, buyableAmount, maxOrderAmount } = params;
  const estimatedAmount = lastPrice * quantity;
  if (!(estimatedAmount > 0)) {
    return { ok: false, status: 400, message: "주문 금액을 계산할 수 없습니다." };
  }
  if (estimatedAmount > maxOrderAmount) {
    return {
      ok: false,
      status: 422,
      message: `1회 주문 한도(${maxOrderAmount.toLocaleString("ko-KR")})를 초과했습니다.`,
    };
  }
  if (estimatedAmount > buyableAmount) {
    return { ok: false, status: 422, message: "주문가능금액을 초과했습니다." };
  }
  return { ok: true, estimatedAmount };
}

// 환경변수 한도. 미설정/잘못된 값이면 보수적 기본값(무제한 금지).
export function getMaxOrderAmount(): number {
  const raw = process.env.MAX_ORDER_AMOUNT;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ORDER_AMOUNT;
}

// 토스 order-info 원시 응답 → OrderInfo.
// ⚠️ probe 결과로 실제 필드명이 다르면 이 함수만 고치면 된다.
export function normalizeOrderInfo(raw: unknown, symbol: string): OrderInfo {
  const data = raw as Record<string, unknown>;
  const r = (data && "result" in data && data.result ? data.result : data) as Record<string, unknown>;
  const currency = typeof r.currency === "string" ? r.currency : "KRW";
  return {
    symbol,
    side: "BUY",
    lastPrice: toNumber(r.lastPrice as Money),
    buyableAmount: pickAmount(r.buyableAmount, currency),
    commissionRate: r.commissionRate != null ? toNumber(r.commissionRate as Money) : undefined,
    currency,
  };
}
