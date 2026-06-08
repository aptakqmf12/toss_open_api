// 표시용 포맷 유틸

export function formatCurrency(value: number, currency = "KRW"): string {
  if (currency === "KRW") {
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

export function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatSignedCurrency(value: number, currency = "KRW"): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value), currency)}`;
}

/** 손익 부호에 따른 Tailwind 색상 클래스 (양수: 빨강, 음수: 파랑 — 국내 관례) */
export function profitColor(value: number): string {
  if (value > 0) return "text-red-500";
  if (value < 0) return "text-blue-500";
  return "text-gray-400";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
