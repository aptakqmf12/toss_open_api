// 매수 주문의 순수 검증/정규화 로직. fetch 없음 → 모킹 없이 테스트 가능.
import type { OrderInfo, BuyOrderRequest } from "./types";

// MAX_ORDER_AMOUNT 미설정 시 적용하는 의도적으로 보수적인 1회 한도(계좌 통화 기준).
// 실계좌 운용 시에는 환경변수로 적절히 올려 설정한다. fail-safe 목적의 안전 기본값.
export const DEFAULT_MAX_ORDER_AMOUNT = 100_000;

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

type Money = string | number | null | undefined;

// 숫자/숫자형 문자열 → 숫자. 파싱 불가 시 0. (lib/toss.ts num() 과 동일 규칙)
function toNumber(v: Money): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 토스 성공 응답은 { result: ... } envelope. result 가 있으면 벗겨낸다.
function unwrap(raw: unknown): Record<string, unknown> {
  const data = (raw ?? {}) as Record<string, unknown>;
  return (data && "result" in data && data.result
    ? data.result
    : data) as Record<string, unknown>;
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

// 토스에는 단일 order-info 엔드포인트가 없다. 시장가 매수 기준가는 호가(orderbook),
// 매수가능금액은 buying-power 에서 따로 받아 OrderInfo 로 합친다. (순수 함수 → 테스트 가능)
//   orderbook  : { result: { currency, asks:[{price,volume}], bids:[{price,volume}] } }
//   buyingPower: { result: { currency, cashBuyingPower } }
// 시장가 매수 체결 기준가는 최우선 매도호가(asks[0]); 없으면 최우선 매수호가(bids[0]).
export function buildOrderInfo(params: {
  symbol: string;
  orderbook: unknown;
  buyingPower: unknown;
}): OrderInfo {
  const ob = unwrap(params.orderbook);
  const bp = unwrap(params.buyingPower);
  const asks = (Array.isArray(ob.asks) ? ob.asks : []) as Array<{ price?: Money }>;
  const bids = (Array.isArray(ob.bids) ? ob.bids : []) as Array<{ price?: Money }>;
  const currency =
    typeof ob.currency === "string"
      ? ob.currency
      : typeof bp.currency === "string"
        ? bp.currency
        : "KRW";
  return {
    symbol: params.symbol,
    side: "BUY",
    lastPrice: toNumber(asks[0]?.price ?? bids[0]?.price),
    buyableAmount: toNumber(bp.cashBuyingPower as Money),
    currency,
  };
}
