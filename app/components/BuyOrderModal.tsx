"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrderInfo, OrderResult } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

type Step = "input" | "confirm" | "result";

export default function BuyOrderModal({
  symbol,
  name,
  onClose,
  onDone,
}: {
  symbol: string;
  name: string;
  onClose: () => void;
  onDone: () => void; // 성공 후 포트폴리오 새로고침
}) {
  const [step, setStep] = useState<Step>("input");
  const [info, setInfo] = useState<OrderInfo | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  // 모달 오픈 시 주문 전 조회
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/order-info?symbol=${encodeURIComponent(symbol)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `조회 실패 (${res.status})`);
        if (alive) setInfo(json as OrderInfo);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const cur = info?.currency ?? "KRW";
  const estimated = (info?.lastPrice ?? 0) * quantity;
  const overBuyable = info ? estimated > info.buyableAmount : false;
  const canProceed = !!info && quantity > 0 && !overBuyable && !loading;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, quantity }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `주문 실패 (${res.status})`);
      setResult(json as OrderResult);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "주문 실패");
      setStep("result");
    } finally {
      setSubmitting(false);
    }
  }, [symbol, quantity]);

  // 전송 중에는 바깥클릭/ESC 닫기 잠금
  const safeClose = useCallback(() => {
    if (!submitting) onClose();
  }, [submitting, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") safeClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safeClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4"
      onClick={safeClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{name} 매수</h2>
            <p className="text-xs text-gray-500">{symbol} · 시장가</p>
          </div>
          {!submitting && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300"
              aria-label="닫기"
            >
              ✕
            </button>
          )}
        </div>

        {loading && (
          <div className="py-10 text-center text-gray-500">불러오는 중…</div>
        )}

        {!loading && step === "input" && info && (
          <>
            <div className="space-y-1 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm">
              <Row label="현재가" value={formatCurrency(info.lastPrice, cur)} />
              <Row label="주문가능금액" value={formatCurrency(info.buyableAmount, cur)} />
            </div>

            <label className="mt-4 block text-sm text-gray-400">수량</label>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="h-10 w-10 rounded-lg border border-gray-700 text-lg"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                }
                className="h-10 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 text-center tabular-nums outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="h-10 w-10 rounded-lg border border-gray-700 text-lg"
              >
                +
              </button>
            </div>

            <div className="mt-4 flex justify-between text-sm">
              <span className="text-gray-400">예상 체결금</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(estimated, cur)}
              </span>
            </div>
            {overBuyable && (
              <p className="mt-2 text-sm text-red-400">
                주문가능금액을 초과했습니다.
              </p>
            )}

            <button
              disabled={!canProceed}
              onClick={() => setStep("confirm")}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold transition hover:bg-blue-500 disabled:opacity-50"
            >
              매수
            </button>
          </>
        )}

        {!loading && step === "confirm" && info && (
          <>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
              <p className="mb-3 font-semibold">
                {name} {quantity.toLocaleString("ko-KR")}주를 시장가 매수합니다.
              </p>
              <Row label="예상 체결금" value={formatCurrency(estimated, cur)} />
              {info.commissionRate != null && (
                <Row
                  label="예상 수수료"
                  value={formatCurrency(estimated * info.commissionRate, cur)}
                />
              )}
              <p className="mt-3 text-xs text-gray-400">
                시장가라 실제 체결가는 달라질 수 있어요.
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                disabled={submitting}
                onClick={() => setStep("input")}
                className="flex-1 rounded-lg border border-gray-700 py-3 text-sm disabled:opacity-50"
              >
                취소
              </button>
              <button
                disabled={submitting}
                onClick={submit}
                className="flex-1 rounded-lg bg-red-600 py-3 text-sm font-semibold transition hover:bg-red-500 disabled:opacity-50"
              >
                {submitting ? "전송 중…" : "확정 매수"}
              </button>
            </div>
          </>
        )}

        {step === "result" && (
          <div className="py-4 text-center">
            {result ? (
              <>
                <div className="mb-2 text-3xl">✅</div>
                <p className="font-semibold">주문이 접수됐어요</p>
                <p className="mt-1 break-all text-xs text-gray-500">
                  주문번호 {result.orderId}
                </p>
              </>
            ) : (
              <>
                <div className="mb-2 text-3xl">⚠️</div>
                <p className="font-semibold text-red-400">{error}</p>
              </>
            )}
            <button
              onClick={() => {
                if (result) onDone();
                onClose();
              }}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold hover:bg-blue-500"
            >
              확인
            </button>
          </div>
        )}

        {error && step === "input" && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
