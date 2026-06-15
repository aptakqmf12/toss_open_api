import { describe, it, expect, afterEach } from "vitest";
import {
  parseBuyOrderInput,
  OrderValidationError,
  checkBuyLimits,
  getMaxOrderAmount,
  DEFAULT_MAX_ORDER_AMOUNT,
  buildOrderInfo,
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

describe("buildOrderInfo", () => {
  it("호가 + 매수가능금액에서 OrderInfo 를 구성한다 (KRW, 최우선 매도호가 기준)", () => {
    const info = buildOrderInfo({
      symbol: "005930",
      orderbook: {
        result: {
          currency: "KRW",
          asks: [{ price: "72100", volume: "10" }],
          bids: [{ price: "72000", volume: "5" }],
        },
      },
      buyingPower: { result: { currency: "KRW", cashBuyingPower: "5000000" } },
    });
    expect(info).toEqual({
      symbol: "005930",
      side: "BUY",
      lastPrice: 72100,
      buyableAmount: 5000000,
      currency: "KRW",
    });
  });

  it("asks 가 비면 최우선 매수호가(bids)로 폴백한다", () => {
    const info = buildOrderInfo({
      symbol: "AAPL",
      orderbook: { result: { currency: "USD", asks: [], bids: [{ price: "150.5", volume: "1" }] } },
      buyingPower: { result: { currency: "USD", cashBuyingPower: "500" } },
    });
    expect(info.lastPrice).toBe(150.5);
    expect(info.currency).toBe("USD");
    expect(info.buyableAmount).toBe(500);
  });

  it("envelope 없이 평평한 응답도 흡수하고, 호가 없으면 0", () => {
    const info = buildOrderInfo({
      symbol: "005930",
      orderbook: { currency: "KRW", asks: [], bids: [] },
      buyingPower: { cashBuyingPower: "0" },
    });
    expect(info.lastPrice).toBe(0);
    expect(info.buyableAmount).toBe(0);
    expect(info.currency).toBe("KRW");
  });
});
