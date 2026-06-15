// 토스증권 Open API 원시 응답 확인용 진단 스크립트.
//
// 실행:
//   node --env-file=.env.local scripts/probe.mjs
//
// .env.local 에 TOSS_ACCESS_TOKEN 또는 (TOSS_CLIENT_ID + TOSS_CLIENT_SECRET) 가 있어야 함.
// /accounts 와 /holdings 의 실제 JSON 구조를 그대로 출력한다.
// 이 출력을 보고 lib/toss.ts 의 RawHoldings 타입 / normalizeHoldings() 를 맞추면 됨.

const BASE = process.env.TOSS_API_BASE_URL ?? "https://openapi.tossinvest.com";

async function getToken() {
  if (process.env.TOSS_ACCESS_TOKEN) return process.env.TOSS_ACCESS_TOKEN;

  const id = process.env.TOSS_CLIENT_ID;
  const secret = process.env.TOSS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("TOSS_ACCESS_TOKEN 또는 TOSS_CLIENT_ID/SECRET 가 필요합니다.");
  }
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${JSON.stringify(json)}`);
  console.log("✓ 토큰 발급 성공 (expires_in:", json.expires_in, ")\n");
  return json.access_token;
}

async function call(path, token, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...extraHeaders,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log(`\n===== GET ${path} → ${res.status} =====`);
  console.log(JSON.stringify(body, null, 2));
  return { status: res.status, body };
}

async function main() {
  const token = await getToken();

  // 1) 계좌 목록
  const accounts = await call("/api/v1/accounts", token);

  // 2) accountSeq 추출 (응답 구조가 배열이든 {accounts:[]} 든 모두 시도)
  const list = Array.isArray(accounts.body)
    ? accounts.body
    : accounts.body?.result ?? accounts.body?.accounts ?? [];
  const seq = process.env.TOSS_ACCOUNT_SEQ || list[0]?.accountSeq;

  if (!seq) {
    console.log("\n⚠️ accountSeq 를 찾지 못했습니다. 위 /accounts 응답 구조를 확인하세요.");
    return;
  }
  console.log(`\n사용할 accountSeq: ${seq}`);

  // 3) 보유 현황
  const holdings = await call("/api/v1/holdings", token, {
    "X-Tossinvest-Account": String(seq),
  });

  // 4) 주문 전 조회 (첫 보유 종목 기준) — 조회만, 주문 아님.
  //    토스에는 단일 order-info 가 없다. 시장가 매수에 필요한 정보를 두 곳에서 모은다:
  //      - 호가(orderbook): 통화 + 시장가 기준가(최우선 매도호가 asks[0].price)
  //      - 매수가능금액(buying-power): 통화별 현금 매수가능금액(cashBuyingPower)
  const first =
    (holdings.body?.result?.items ?? holdings.body?.items ?? [])[0];
  const firstSymbol = first?.symbol;
  const currency = first?.currency ?? "KRW";
  if (firstSymbol) {
    await call(
      `/api/v1/orderbook?symbol=${encodeURIComponent(firstSymbol)}`,
      token,
    );
    await call(
      `/api/v1/buying-power?currency=${encodeURIComponent(currency)}`,
      token,
      { "X-Tossinvest-Account": String(seq) },
    );
  } else {
    console.log("\n⚠️ 보유 종목이 없어 주문 전 조회를 건너뜁니다.");
  }
}

main().catch((e) => {
  console.error("\n✗ 오류:", e.message);
  process.exit(1);
});
