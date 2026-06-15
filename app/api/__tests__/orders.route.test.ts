import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ isAuthed: vi.fn() }));
vi.mock("@/lib/toss", () => ({
  getOrderInfo: vi.fn(),
  placeBuyOrder: vi.fn(),
  TossApiError: class TossApiError extends Error {},
}));

import { POST } from "@/app/api/orders/route";
import { isAuthed } from "@/lib/auth";
import { getOrderInfo, placeBuyOrder } from "@/lib/toss";

function req(body: unknown) {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const okInfo = {
  symbol: "005930",
  side: "BUY" as const,
  lastPrice: 80_000,
  buyableAmount: 100_000_000,
  currency: "KRW",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAX_ORDER_AMOUNT = "1000000";
});

describe("POST /api/orders", () => {
  it("미인증이면 401", async () => {
    vi.mocked(isAuthed).mockResolvedValue(false);
    const res = await POST(req({ symbol: "005930", quantity: 1 }));
    expect(res.status).toBe(401);
    expect(placeBuyOrder).not.toHaveBeenCalled();
  });

  it("잘못된 입력이면 400", async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    const res = await POST(req({ symbol: "005930", quantity: 0 }));
    expect(res.status).toBe(400);
    expect(placeBuyOrder).not.toHaveBeenCalled();
  });

  it("1회 한도 초과면 422 (주문 전송 안 함)", async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    vi.mocked(getOrderInfo).mockResolvedValue(okInfo);
    const res = await POST(req({ symbol: "005930", quantity: 100 }));
    expect(res.status).toBe(422);
    expect(placeBuyOrder).not.toHaveBeenCalled();
  });

  it("정상 주문이면 200 + orderId, placeBuyOrder 1회 호출", async () => {
    vi.mocked(isAuthed).mockResolvedValue(true);
    vi.mocked(getOrderInfo).mockResolvedValue(okInfo);
    vi.mocked(placeBuyOrder).mockResolvedValue({ orderId: "ord-1", clientOrderId: "cid-1" });
    const res = await POST(req({ symbol: "005930", quantity: 1 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orderId).toBe("ord-1");
    expect(json.estimatedAmount).toBe(80_000);
    expect(placeBuyOrder).toHaveBeenCalledOnce();
  });
});
