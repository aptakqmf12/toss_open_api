"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { HoldingItem } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/format";

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

export default function AllocationChart({
  items,
  currency,
  rate = 1,
}: {
  items: HoldingItem[];
  currency: string;
  /** 기준 통화 → 표시 통화 환산 배수 (툴팁 금액에 적용; 비중은 불변) */
  rate?: number;
}) {
  const data = items
    .map((i) => ({ name: i.name, value: i.marketValue, weight: i.weight }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => {
              const v = (typeof value === "number" ? value : Number(value)) * rate;
              const weight = (item?.payload as { weight?: number })?.weight ?? 0;
              return [
                `${formatCurrency(v, currency)} (${formatPercent(weight).replace("+", "")})`,
                "",
              ];
            }}
            contentStyle={{
              background: "#1f2937",
              border: "none",
              borderRadius: 8,
              color: "#fff",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
