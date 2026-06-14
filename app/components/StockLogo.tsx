"use client";

import { useState } from "react";

// 심볼 기반 결정적 색상 (로고 로딩 실패 시 모노그램 배경)
const PALETTE = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0d9488", "#ea580c", "#4f46e5", "#65a30d",
];
function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function StockLogo({
  symbol,
  name,
  size = 36,
}: {
  symbol: string;
  name?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const seed = symbol || name || "?";
  const label = seed.slice(0, 2).toUpperCase();
  const dim = { width: size, height: size };

  if (failed || !symbol) {
    return (
      <span
        style={{ ...dim, background: colorFor(seed) }}
        className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        aria-hidden
      >
        {label}
      </span>
    );
  }

  return (
    // 실제 종목 로고 (parqet CDN). 없는 종목은 onError 로 모노그램 폴백.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`}
      alt={name ?? symbol}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={dim}
      className="shrink-0 rounded-full bg-white object-contain ring-1 ring-black/5"
    />
  );
}
