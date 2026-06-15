// 대시보드 프론트엔드가 사용하는 정규화된 포트폴리오 타입.
// 토스 API의 원시 응답(lib/toss.ts)을 이 형태로 가공해서 내려준다.

export interface HoldingItem {
  /** 종목코드 (예: 005930) */
  symbol: string;
  /** 종목명 */
  name: string;
  /** 보유 수량 */
  quantity: number;
  /** 평균 매입가 */
  averagePurchasePrice: number;
  /** 현재가 */
  lastPrice: number;
  /** 평가금액 = 현재가 * 수량 */
  marketValue: number;
  /** 매입금액 = 평균매입가 * 수량 */
  purchaseAmount: number;
  /** 평가손익 (금액) */
  profitLoss: number;
  /** 평가손익률 (%) */
  profitLossRate: number;
  /** 전체 평가금액 대비 비중 (%) */
  weight: number;
  /** 통화 (KRW / USD) */
  currency: string;
}

export interface ExchangeRate {
  /** 기준 통화 (계좌 통화) */
  base: string;
  /** 환산 대상 통화 */
  quote: string;
  /** 1 base = rate quote */
  rate: number;
  /** 환율 기준 시각 (ISO) */
  asOf: string;
}

export interface PortfolioSummary {
  /** 계좌번호 (마스킹된 표시용) */
  accountNo: string;
  /** 총 평가금액 */
  totalMarketValue: number;
  /** 총 매입금액 */
  totalPurchaseAmount: number;
  /** 총 평가손익 (금액) */
  totalProfitLoss: number;
  /** 총 평가손익률 (%) */
  totalProfitLossRate: number;
  /** 당일 손익 (금액) */
  dailyProfitLoss: number;
  /** 기준 통화 */
  currency: string;
  /** 보유 종목 목록 */
  items: HoldingItem[];
  /** 데이터 갱신 시각 (ISO) */
  updatedAt: string;
  /** 기준 통화 → 반대 통화 환율. 통화 토글(원화/달러)에 사용. 조회 실패 시 없음. */
  exchangeRate?: ExchangeRate;
}

// ── 매수 주문 관련 ───────────────────────────────────────────

/** 주문 전 거래 가능 정보 (정규화) */
export interface OrderInfo {
  symbol: string;
  side: "BUY";
  /** 현재가 */
  lastPrice: number;
  /** 주문가능금액(현금 기반) */
  buyableAmount: number;
  /** 수수료율 (있으면) */
  commissionRate?: number;
  /** 통화 (KRW / USD) */
  currency: string;
}

/** 클라이언트 → 서버 매수 요청 (가격/금액은 서버가 결정) */
export interface BuyOrderRequest {
  symbol: string;
  quantity: number;
}

/** 매수 주문 전송 결과 */
export interface OrderResult {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  quantity: number;
  /** 전송 시점 예상 체결금 */
  estimatedAmount: number;
}
