import { NextResponse } from "next/server";
import { getPortfolio, TossApiError } from "@/lib/toss";

// 매 요청마다 최신 데이터를 받아오도록 캐시 비활성화
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const portfolio = await getPortfolio();
    return NextResponse.json(portfolio);
  } catch (err) {
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
