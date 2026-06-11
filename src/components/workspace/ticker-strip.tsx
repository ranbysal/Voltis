"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type TickerQuote = {
  symbol: string;
  note?: string;
  price: number;
  change: number;
  decimals: number;
  drift: number;
};

const BASE_QUOTES: TickerQuote[] = [
  { symbol: "NQ1!", price: 19164.75, change: 12.5, decimals: 2, drift: 1.25 },
  { symbol: "YM1!", price: 38642, change: 45, decimals: 2, drift: 4 },
  { symbol: "ES1!", price: 5324.75, change: 8.25, decimals: 2, drift: 0.5 },
  {
    symbol: "GC1!",
    note: "(Gold)",
    price: 2340.45,
    change: 11.35,
    decimals: 2,
    drift: 0.45,
  },
  {
    symbol: "SI1!",
    note: "(Silver)",
    price: 27.36,
    change: 0.28,
    decimals: 2,
    drift: 0.02,
  },
  {
    symbol: "CL1!",
    note: "(Oil)",
    price: 78.45,
    change: -0.3,
    decimals: 2,
    drift: 0.05,
  },
];

export function TickerStrip({ livePrice }: { livePrice?: number | null }) {
  const [quotes, setQuotes] = useState(BASE_QUOTES);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setQuotes((current) =>
        current.map((quote) => {
          const delta = (Math.random() - 0.5) * quote.drift;
          return {
            ...quote,
            price: quote.price + delta,
            change: quote.change + delta,
          };
        }),
      );
    }, 3200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="grid h-11 shrink-0 grid-cols-6 divide-x divide-line border-b border-line bg-panel">
      {quotes.map((quote, index) => {
        const price =
          index === 0 && livePrice ? livePrice : quote.price;
        const positive = quote.change >= 0;
        const pct = Math.abs((quote.change / price) * 100);
        return (
          <div
            key={quote.symbol}
            className="flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap px-2 font-mono text-[10px]"
          >
            <span className="font-semibold text-ink">
              {quote.symbol}
            </span>
            {quote.note ? (
              <span className="text-ink-3">{quote.note}</span>
            ) : null}
            <span className="tabular-nums text-ink">
              {price.toLocaleString("en-US", {
                minimumFractionDigits: quote.decimals,
                maximumFractionDigits: quote.decimals,
              })}
            </span>
            <span
              className={cn(
                "flex items-center gap-0.5 tabular-nums",
                positive ? "text-up" : "text-down",
              )}
            >
              {positive ? "+" : "-"}
              {Math.abs(quote.change).toFixed(2)} ({pct.toFixed(2)}%)
              {positive ? (
                <ChevronUp size={11} strokeWidth={2.4} />
              ) : (
                <ChevronDown size={11} strokeWidth={2.4} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
