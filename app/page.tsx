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
                {data.isMock && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs">
                    MOCK 데이터
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
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
                value={formatCurrency(data.totalMarketValue, data.currency)}
              />
              <SummaryCard
                label="총 평가손익"
                value={formatSignedCurrency(data.totalProfitLoss, data.currency)}
                sub={formatPercent(data.totalProfitLossRate)}
                color={profitColor(data.totalProfitLoss)}
              />
              <SummaryCard
                label="당일 손익"
                value={formatSignedCurrency(data.dailyProfitLoss, data.currency)}
                color={profitColor(data.dailyProfitLoss)}
              />
              <SummaryCard
                label="총 매입금액"
                value={formatCurrency(data.totalPurchaseAmount, data.currency)}
              />
            </section>

            {/* 자산 배분 */}
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold mb-2">자산 배분</h2>
              <AllocationChart items={data.items} currency={data.currency} />
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
                      <td>{formatCurrency(it.averagePurchasePrice, it.currency)}</td>
                      <td>{formatCurrency(it.lastPrice, it.currency)}</td>
                      <td>{formatCurrency(it.marketValue, it.currency)}</td>
                      <td className={profitColor(it.profitLoss)}>
                        <div>{formatSignedCurrency(it.profitLoss, it.currency)}</div>
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
