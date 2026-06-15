"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortfolioSummary, HoldingItem } from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  profitColor,
  formatDateTime,
} from "@/lib/format";
import AllocationChart from "./components/AllocationChart";
import StockLogo from "./components/StockLogo";
import BuyOrderModal from "./components/BuyOrderModal";

export default function Home() {
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needAuth, setNeedAuth] = useState(false);
  // 표시 통화 (원화/달러 토글). null 이면 환산 대상 통화(원화) 우선.
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  // 매수 모달 대상 종목 (null 이면 닫힘)
  const [buyTarget, setBuyTarget] = useState<HoldingItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      if (res.status === 401) {
        setNeedAuth(true);
        setData(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
      setNeedAuth(false);
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

  const logout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    setData(null);
    setNeedAuth(true);
  }, []);

  // 기준 통화(계좌 통화) → 표시 통화 환산.
  const base = data?.currency ?? "KRW";
  const cur = displayCurrency ?? data?.exchangeRate?.quote ?? base;
  const rate = data?.exchangeRate && cur !== base ? data.exchangeRate.rate : 1;
  const conv = (v: number) => v * rate;

  if (needAuth) {
    return <LoginScreen onSuccess={load} />;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10 space-y-6">
        {/* 헤더 */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              내 증권 현황판
            </h1>
            {data && (
              <p className="mt-1 text-sm text-gray-400">
                계좌 {data.accountNo}
              </p>
            )}
            {data?.exchangeRate && cur !== base && (
              <p className="mt-0.5 text-xs text-gray-500">
                적용환율 1 {base} ={" "}
                {data.exchangeRate.rate.toLocaleString("ko-KR")}{" "}
                {data.exchangeRate.quote} · 기준{" "}
                {formatDateTime(data.exchangeRate.asOf)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {data?.exchangeRate && (
              <div className="flex overflow-hidden rounded-lg border border-gray-700 text-xs">
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
            <button
              onClick={load}
              disabled={loading}
              title="새로고침"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "불러오는 중…" : "새로고침"}
            </button>
            <button
              onClick={logout}
              title="잠그기"
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition hover:text-gray-200"
            >
              잠그기
            </button>
          </div>
        </header>

        {data && (
          <p className="-mt-2 text-xs text-gray-500">
            갱신 {formatDateTime(data.updatedAt)}
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            ⚠️ {error}
          </div>
        )}

        {!data && !error && (
          <div className="py-24 text-center text-gray-500">
            데이터를 불러오는 중…
          </div>
        )}

        {data && (
          <>
            {/* 요약 카드 */}
            <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <SummaryCard
                label="총 평가금액"
                value={formatCurrency(conv(data.totalMarketValue), cur)}
                emphasize
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
            <section className="rounded-2xl border border-white/5 bg-gray-900/60 p-5 md:p-6 shadow-lg shadow-black/20">
              <h2 className="mb-3 text-base md:text-lg font-semibold">자산 배분</h2>
              <AllocationChart items={data.items} currency={cur} rate={rate} />
            </section>

            {/* 보유 종목 */}
            <section className="rounded-2xl border border-white/5 bg-gray-900/60 p-5 md:p-6 shadow-lg shadow-black/20">
              <h2 className="mb-4 text-base md:text-lg font-semibold">
                보유 종목{" "}
                <span className="text-gray-500">({data.items.length})</span>
              </h2>

              {/* 모바일: 카드 리스트 (가로 잘림 방지) */}
              <div className="space-y-3 md:hidden">
                {data.items.map((it) => (
                  <HoldingCard
                    key={it.symbol}
                    it={it}
                    cur={cur}
                    conv={conv}
                    onBuy={() => setBuyTarget(it)}
                  />
                ))}
              </div>

              {/* 데스크톱: 테이블 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-right text-gray-400">
                      <th className="py-2 text-left font-medium">종목</th>
                      <th className="py-2 font-medium">수량</th>
                      <th className="py-2 font-medium">평균단가</th>
                      <th className="py-2 font-medium">현재가</th>
                      <th className="py-2 font-medium">평가금액</th>
                      <th className="py-2 font-medium">손익</th>
                      <th className="py-2 font-medium">비중</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it) => (
                      <tr
                        key={it.symbol}
                        title={`${it.name} (${it.symbol})`}
                        className="border-b border-gray-800/50 text-right transition-colors hover:bg-gray-800/40"
                      >
                        <td className="py-3 text-left">
                          <div className="flex items-center gap-3">
                            <StockLogo symbol={it.symbol} name={it.name} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{it.name}</div>
                              <div className="text-xs text-gray-500">
                                {it.symbol}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="tabular-nums">{formatNumber(it.quantity)}</td>
                        <td className="tabular-nums">
                          {formatCurrency(conv(it.averagePurchasePrice), cur)}
                        </td>
                        <td className="tabular-nums">
                          {formatCurrency(conv(it.lastPrice), cur)}
                        </td>
                        <td className="tabular-nums">
                          {formatCurrency(conv(it.marketValue), cur)}
                        </td>
                        <td className={`tabular-nums ${profitColor(it.profitLoss)}`}>
                          <div>{formatSignedCurrency(conv(it.profitLoss), cur)}</div>
                          <div className="text-xs">
                            {formatPercent(it.profitLossRate)}
                          </div>
                        </td>
                        <td className="tabular-nums text-gray-300">
                          {it.weight.toFixed(1)}%
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setBuyTarget(it)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium transition hover:bg-blue-500"
                          >
                            매수
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
      {buyTarget && (
        <BuyOrderModal
          symbol={buyTarget.symbol}
          name={buyTarget.name}
          onClose={() => setBuyTarget(null)}
          onDone={load}
        />
      )}
    </main>
  );
}

function HoldingCard({
  it,
  cur,
  conv,
  onBuy,
}: {
  it: HoldingItem;
  cur: string;
  conv: (v: number) => number;
  onBuy: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
      <div className="flex items-center gap-3">
        <StockLogo symbol={it.symbol} name={it.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{it.name}</div>
          <div className="text-xs text-gray-500">
            {it.symbol} · 비중 {it.weight.toFixed(1)}%
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">
            {formatCurrency(conv(it.marketValue), cur)}
          </div>
          <div className={`text-xs tabular-nums ${profitColor(it.profitLoss)}`}>
            {formatSignedCurrency(conv(it.profitLoss), cur)} (
            {formatPercent(it.profitLossRate)})
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-800 pt-3 text-xs">
        <Field label="수량" value={formatNumber(it.quantity)} />
        <Field
          label="평균단가"
          value={formatCurrency(conv(it.averagePurchasePrice), cur)}
        />
        <Field label="현재가" value={formatCurrency(conv(it.lastPrice), cur)} />
      </div>
      <button
        onClick={onBuy}
        className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium transition hover:bg-blue-500"
      >
        매수
      </button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className="mt-0.5 tabular-nums text-gray-200">{value}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color = "text-gray-100",
  emphasize = false,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 md:p-5 shadow-lg shadow-black/20 ${
        emphasize
          ? "border-blue-500/30 bg-blue-500/10"
          : "border-white/5 bg-gray-900/60"
      }`}
    >
      <div className="text-xs md:text-sm text-gray-400">{label}</div>
      <div className={`mt-2 text-lg md:text-xl font-bold tabular-nums ${color}`}>
        {value}
      </div>
      {sub && <div className={`mt-1 text-sm tabular-nums ${color}`}>{sub}</div>}
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "비밀번호가 올바르지 않습니다.");
      }
    } catch {
      setError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-950 to-gray-900 px-4 text-gray-100">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900/70 p-8 shadow-2xl shadow-black/40"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/20 text-2xl">
            🔒
          </div>
          <h1 className="text-lg font-bold">내 증권 현황판</h1>
          <p className="mt-1 text-sm text-gray-400">
            비밀번호를 입력하면 접속할 수 있어요
          </p>
        </div>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-center text-lg tracking-widest text-gray-100 outline-none transition focus:border-blue-500"
        />

        {error && (
          <p className="mt-3 text-center text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold transition hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? "확인 중…" : "입장"}
        </button>
      </form>
    </main>
  );
}
