import { NextResponse } from "next/server";
import { getOrderInfo, TossApiError } from "@/lib/toss";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol 이 필요합니다." }, { status: 400 });
  }
  try {
    const info = await getOrderInfo(symbol);
    return NextResponse.json(info);
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
