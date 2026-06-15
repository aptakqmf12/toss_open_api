import { describe, it, expect, afterEach } from "vitest";
import {
  parseBuyOrderInput,
  OrderValidationError,
  checkBuyLimits,
  getMaxOrderAmount,
  DEFAULT_MAX_ORDER_AMOUNT,
  normalizeOrderInfo,
} from "@/lib/orders";

describe("parseBuyOrderInput", () => {
  it("정상 입력을 파싱한다", () => {
    expect(parseBuyOrderInput({ symbol: "005930", quantity: 3 })).toEqual({
      symbol: "005930",
      quantity: 3,
    });
  });
  it("symbol 누락 시 throw", () => {
    expect(() => parseBuyOrderInput({ quantity: 1 })).toThrow(OrderValidationError);
  });
  it("수량이 0 이하/정수아님이면 throw", () => {
    expect(() => parseBuyOrderInput({ symbol: "A", quantity: 0 })).toThrow(OrderValidationError);
    expect(() => parseBuyOrderInput({ symbol: "A", quantity: 1.5 })).toThrow(OrderValidationError);
    expect(() => parseBuyOrderInput({ symbol: "A", quantity: -2 })).toThrow(OrderValidationError);
  });
  it("null 입력도 안전하게 throw", () => {
    expect(() => parseBuyOrderInput(null)).toThrow(OrderValidationError);
  });
});

describe("checkBuyLimits", () => {
  const base = { lastPrice: 1000, buyableAmount: 1_000_000, maxOrderAmount: 100_000 };
  it("정상 범위면 ok + 예상금액", () => {
    const r = checkBuyLimits({ ...base, quantity: 10 });
    expect(r).toEqual({ ok: true, estimatedAmount: 10_000 });
  });
  it("1회 한도 초과면 422", () => {
    const r = checkBuyLimits({ ...base, quantity: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });
  it("주문가능금액 초과면 422", () => {
    const r = checkBuyLimits({ lastPrice: 1000, buyableAmount: 5_000, maxOrderAmount: 100_000, quantity: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });
  it("금액이 0 이하면 400", () => {
    const r = checkBuyLimits({ ...base, lastPrice: 0, quantity: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

describe("getMaxOrderAmount", () => {
  afterEach(() => { delete process.env.MAX_ORDER_AMOUNT; });
  it("환경변수 값을 쓴다", () => {
    process.env.MAX_ORDER_AMOUNT = "500000";
    expect(getMaxOrderAmount()).toBe(500_000);
  });
  it("미설정/잘못된 값이면 보수적 기본값", () => {
    expect(getMaxOrderAmount()).toBe(DEFAULT_MAX_ORDER_AMOUNT);
    process.env.MAX_ORDER_AMOUNT = "abc";
    expect(getMaxOrderAmount()).toBe(DEFAULT_MAX_ORDER_AMOUNT);
  });
});

describe("normalizeOrderInfo", () => {
  it("스칼라 금액을 정규화한다", () => {
    const r = normalizeOrderInfo(
      { lastPrice: "80000", buyableAmount: "1000000", commissionRate: "0.00015", currency: "KRW" },
      "005930",
    );
    expect(r).toEqual({
      symbol: "005930",
      side: "BUY",
      lastPrice: 80000,
      buyableAmount: 1000000,
      commissionRate: 0.00015,
      currency: "KRW",
    });
  });
  it("{ amount: { krw, usd } } 중첩 버킷도 흡수한다", () => {
    const r = normalizeOrderInfo(
      { lastPrice: "80000", buyableAmount: { amount: { krw: "1000000", usd: "0" } }, currency: "KRW" },
      "005930",
    );
    expect(r.buyableAmount).toBe(1000000);
  });
  it("{result} 래핑과 통화버킷을 흡수한다", () => {
    const r = normalizeOrderInfo(
      { result: { lastPrice: "150", buyableAmount: { krw: "0", usd: "500" }, currency: "USD" } },
      "AAPL",
    );
    expect(r.lastPrice).toBe(150);
    expect(r.buyableAmount).toBe(500);
    expect(r.currency).toBe("USD");
  });
});
