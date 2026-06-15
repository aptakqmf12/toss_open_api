import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { isAuthed } from "@/lib/auth";
import { getOrderInfo, placeBuyOrder, TossApiError } from "@/lib/toss";
import {
  parseBuyOrderInput,
  OrderValidationError,
  checkBuyLimits,
  getMaxOrderAmount,
} from "@/lib/orders";
import type { OrderResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 1) 인증 강제
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) 입력 검증
  let parsed;
  try {
    parsed = parseBuyOrderInput(await req.json().catch(() => null));
  } catch (e) {
    const msg = e instanceof OrderValidationError ? e.message : "잘못된 요청입니다.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    // 3) order-info 재조회 (서버 권위 현재가·주문가능금액)
    const info = await getOrderInfo(parsed.symbol);

    // 4) 한도·주문가능금액 검증 (클라이언트 값 신뢰 안 함)
    const check = checkBuyLimits({
      lastPrice: info.lastPrice,
      quantity: parsed.quantity,
      buyableAmount: info.buyableAmount,
      maxOrderAmount: getMaxOrderAmount(),
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.message }, { status: check.status });
    }

    // 5) 멱등성 키 + 주문 전송
    const clientOrderId = randomUUID();
    const placed = await placeBuyOrder({
      symbol: parsed.symbol,
      quantity: parsed.quantity,
      clientOrderId,
    });

    const result: OrderResult = {
      orderId: placed.orderId,
      clientOrderId: placed.clientOrderId,
      symbol: parsed.symbol,
      quantity: parsed.quantity,
      estimatedAmount: check.estimatedAmount,
    };
    return NextResponse.json(result);
  } catch (err) {
    // 5xx/타임아웃은 자동 재시도하지 않는다 (중복주문 위험).
    if (err instanceof TossApiError) {
      return NextResponse.json(
        { error: err.message, detail: err.detail ?? null },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
