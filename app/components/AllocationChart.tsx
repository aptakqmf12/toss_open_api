"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { HoldingItem } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

type Datum = {
  name: string;
  symbol: string;
  value: number; // 표시 통화로 환산된 평가금액
  weight: number; // 전체 대비 비중 (%)
  color: string;
};

export default function AllocationChart({
  items,
  currency,
  rate = 1,
}: {
  items: HoldingItem[];
  currency: string;
  /** 기준 통화 → 표시 통화 환산 배수 (금액에 적용; 비중은 불변) */
  rate?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  // 비중(weight)으로 조각 크기를 결정한다. 통화가 섞여도 비중은 기준 통화로 계산돼 있어 정확하다.
  const data: Datum[] = items
    .map((i) => ({
      name: i.name,
      symbol: i.symbol,
      value: i.marketValue * rate,
      weight: i.weight,
    }))
    .sort((a, b) => b.weight - a.weight)
    .map((d, idx) => ({ ...d, color: COLORS[idx % COLORS.length] }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        보유 종목이 없어요
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const showing = active != null ? data[active] : null;

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center">
      {/* 도넛 */}
      <div className="relative h-64 w-full md:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="weight"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={66}
              outerRadius={100}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              onMouseEnter={(_, idx) => setActive(idx)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((d, idx) => (
                <Cell
                  key={d.symbol}
                  fill={d.color}
                  opacity={active === null || active === idx ? 1 : 0.3}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active: a, payload }) => (
                <ChartTooltip
                  active={a}
                  payload={payload as unknown as ReadonlyArray<{ payload?: Datum }>}
                  currency={currency}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* 중앙 라벨: 호버 중인 항목, 없으면 합계 */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {showing ? (
            <>
              <span className="max-w-[8rem] truncate text-sm font-semibold">
                {showing.name}
              </span>
              <span className="text-xl font-bold tabular-nums">
                {showing.weight.toFixed(1)}%
              </span>
              <span className="text-xs tabular-nums text-gray-400">
                {formatCurrency(showing.value, currency)}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">총 평가금액</span>
              <span className="text-base font-bold tabular-nums">
                {formatCurrency(total, currency)}
              </span>
              <span className="text-xs text-gray-500">{data.length}개 종목</span>
            </>
          )}
        </div>
      </div>

      {/* 범례 (차트와 양방향 하이라이트) */}
      <ul className="flex-1 space-y-0.5">
        {data.map((d, idx) => (
          <li
            key={d.symbol}
            onMouseEnter={() => setActive(idx)}
            onMouseLeave={() => setActive(null)}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors ${
              active === idx ? "bg-gray-800" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: d.color }}
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="ml-2 shrink-0 tabular-nums text-gray-300">
              {d.weight.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Datum }>;
  currency: string;
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: d.color }}
        />
        <span className="font-semibold">{d.name}</span>
      </div>
      <div className="mt-0.5 text-gray-400">{d.symbol}</div>
      <div className="mt-1 tabular-nums">{formatCurrency(d.value, currency)}</div>
      <div className="tabular-nums text-gray-300">비중 {d.weight.toFixed(1)}%</div>
    </div>
  );
}
