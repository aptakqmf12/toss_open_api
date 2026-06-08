import type { PortfolioSummary, HoldingItem } from "./types";

// 자격증명 발급 전 UI/로직을 확인하기 위한 더미 데이터.
// TOSS_USE_MOCK=true 일 때 lib/toss.ts 가 이 값을 반환한다.

const rawItems: Array<
  Pick<
    HoldingItem,
    "symbol" | "name" | "quantity" | "averagePurchasePrice" | "lastPrice" | "currency"
  >
> = [
  { symbol: "005930", name: "삼성전자", quantity: 50, averagePurchasePrice: 71200, lastPrice: 78400, currency: "KRW" },
  { symbol: "000660", name: "SK하이닉스", quantity: 12, averagePurchasePrice: 158000, lastPrice: 201500, currency: "KRW" },
  { symbol: "035720", name: "카카오", quantity: 30, averagePurchasePrice: 52300, lastPrice: 41250, currency: "KRW" },
  { symbol: "373220", name: "LG에너지솔루션", quantity: 4, averagePurchasePrice: 412000, lastPrice: 358000, currency: "KRW" },
  { symbol: "035420", name: "NAVER", quantity: 15, averagePurchasePrice: 188000, lastPrice: 214500, currency: "KRW" },
];

export function buildMockPortfolio(): PortfolioSummary {
  const items: HoldingItem[] = rawItems.map((r) => {
    const marketValue = r.lastPrice * r.quantity;
    const purchaseAmount = r.averagePurchasePrice * r.quantity;
    const profitLoss = marketValue - purchaseAmount;
    const profitLossRate = purchaseAmount === 0 ? 0 : (profitLoss / purchaseAmount) * 100;
    return {
      ...r,
      marketValue,
      purchaseAmount,
      profitLoss,
      profitLossRate,
      weight: 0, // 아래에서 채움
    };
  });

  const totalMarketValue = items.reduce((s, i) => s + i.marketValue, 0);
  const totalPurchaseAmount = items.reduce((s, i) => s + i.purchaseAmount, 0);
  for (const i of items) {
    i.weight = totalMarketValue === 0 ? 0 : (i.marketValue / totalMarketValue) * 100;
  }

  const totalProfitLoss = totalMarketValue - totalPurchaseAmount;
  const totalProfitLossRate =
    totalPurchaseAmount === 0 ? 0 : (totalProfitLoss / totalPurchaseAmount) * 100;

  return {
    accountNo: "1234-56**-**",
    totalMarketValue,
    totalPurchaseAmount,
    totalProfitLoss,
    totalProfitLossRate,
    dailyProfitLoss: 184300,
    currency: "KRW",
    items,
    updatedAt: new Date().toISOString(),
    isMock: true,
  };
}
