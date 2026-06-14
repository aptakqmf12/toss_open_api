"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortfolioSummary } from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  profitColor,
  formatDateTime,
} from "@/lib/format";
import AllocationChart from "./components/AllocationChart";

export default function Home() {
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 표시 통화 (원화/달러 토글). null 이면 환산 대상 통화(원화) 우선.
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
      setData(json as PortfolioSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 기준 통화(계좌 통화) → 표시 통화 환산.
  // 기본값은 환산 대상 통화(보통 원화)이며, 토글로 계좌 통화 원본도 볼 수 있다.
  const base = data?.currency ?? "KRW";
  const cur = displayCurrency ?? data?.exchangeRate?.quote ?? base;
  const rate = data?.exchangeRate && cur !== base ? data.exchangeRate.rate : 1;
  const conv = (v: number) => v * rate;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 헤더 */}
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">내 증권 현황판</h1>
            {data && (
              <p className="text-sm text-gray-400 mt-1">
                계좌 {data.accountNo}
                {data.exchangeRate && cur !== base && (
                  <span className="ml-2 text-gray-500">
                    적용환율 1 {base} = {data.exchangeRate.rate.toLocaleString("ko-KR")}{" "}
                    {data.exchangeRate.quote} · 기준 {formatDateTime(data.exchangeRate.asOf)}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data?.exchangeRate && (
              <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
                {[data.exchangeRate.quote, data.currency].map((c) => (
                  <button
                    key={c}
                    onClick={() => setDisplayCurrency(c)}
                    className={`px-3 py-1.5 font-medium transition ${
                      cur === c
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {data && (
              <span className="text-xs text-gray-500">
                갱신 {formatDateTime(data.updatedAt)}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition"
            >
              {loading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {!data && !error && (
          <div className="text-gray-500 py-20 text-center">데이터를 불러오는 중…</div>
        )}

        {data && (
          <>
            {/* 요약 카드 */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="총 평가금액"
                value={formatCurrency(conv(data.totalMarketValue), cur)}
              />
              <SummaryCard
                label="총 평가손익"
                value={formatSignedCurrency(conv(data.totalProfitLoss), cur)}
                sub={formatPercent(data.totalProfitLossRate)}
                color={profitColor(data.totalProfitLoss)}
              />
              <SummaryCard
                label="당일 손익"
                value={formatSignedCurrency(conv(data.dailyProfitLoss), cur)}
                color={profitColor(data.dailyProfitLoss)}
              />
              <SummaryCard
                label="총 매입금액"
                value={formatCurrency(conv(data.totalPurchaseAmount), cur)}
              />
            </section>

            {/* 자산 배분 */}
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold mb-2">자산 배분</h2>
              <AllocationChart items={data.items} currency={cur} rate={rate} />
            </section>

            {/* 보유 종목 테이블 */}
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-4">
                보유 종목 ({data.items.length})
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800 text-right">
                    <th className="py-2 text-left font-medium">종목</th>
                    <th className="py-2 font-medium">수량</th>
                    <th className="py-2 font-medium">평균단가</th>
                    <th className="py-2 font-medium">현재가</th>
                    <th className="py-2 font-medium">평가금액</th>
                    <th className="py-2 font-medium">손익</th>
                    <th className="py-2 font-medium">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr
                      key={it.symbol}
                      className="border-b border-gray-800/50 text-right"
                    >
                      <td className="py-3 text-left">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-gray-500">{it.symbol}</div>
                      </td>
                      <td>{formatNumber(it.quantity)}</td>
                      <td>{formatCurrency(conv(it.averagePurchasePrice), cur)}</td>
                      <td>{formatCurrency(conv(it.lastPrice), cur)}</td>
                      <td>{formatCurrency(conv(it.marketValue), cur)}</td>
                      <td className={profitColor(it.profitLoss)}>
                        <div>{formatSignedCurrency(conv(it.profitLoss), cur)}</div>
                        <div className="text-xs">{formatPercent(it.profitLossRate)}</div>
                      </td>
                      <td className="text-gray-300">{it.weight.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color = "text-gray-100",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="text-sm text-gray-400">{label}</div>
      <div className={`mt-2 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className={`mt-1 text-sm ${color}`}>{sub}</div>}
    </div>
  );
}
