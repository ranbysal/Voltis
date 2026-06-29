"use client";

import {
  Bell,
  Brush,
  Crosshair,
  Eye,
  Layers3,
  LogIn,
  Magnet,
  Moon,
  MoveDiagonal,
  Ruler,
  Spline,
  Sun,
  Trash2,
  TrendingUp,
  Type,
  ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { computeEma, MarketChart, type ChartTrade } from "@/components/market-chart";
import { BootProvider } from "@/components/transition/boot-context";
import { TickerStrip, type TickerQuote } from "@/components/workspace/ticker-strip";
import { Dropdown, MenuItem } from "@/components/workspace/ui";
import { generateMarketBars } from "@/lib/market";
import { cn } from "@/lib/utils";

/**
 * The trade Yazan (the admin) currently has open, shown read-only to viewers.
 * Entry / TP / SL / side / quantity are fixed facts of the position; the
 * current price and P&L are derived from the (deterministic demo) feed so the
 * numbers always reconcile.
 */
const TRADE = {
  symbol: "NQ1!",
  exchange: "CME",
  name: "E-mini Nasdaq-100",
  side: "long" as const,
  quantity: 4,
  entry: 29_332.5,
  takeProfit: 29_670,
  stopLoss: 28_975,
  multiplier: 20, // NQ is $20 per index point
  leverage: 20,
  openedLabel: "May 26, 2025 · 16:12:34",
};

const TICKER_QUOTES: TickerQuote[] = [
  { symbol: "NQ1!", price: 29_223, change: 11.2, decimals: 2, drift: 1.25 },
  { symbol: "YM1!", price: 30_657.4, change: 60.4, decimals: 2, drift: 4 },
  { symbol: "ES1!", price: 5_236.09, change: 9.59, decimals: 2, drift: 0.5 },
  { symbol: "GC1!", note: "(Gold)", price: 2_329.21, change: 10.11, decimals: 2, drift: 0.45 },
  { symbol: "SI1!", note: "(Silver)", price: 27.34, change: 0.26, decimals: 2, drift: 0.02 },
  { symbol: "CL1!", note: "(Oil)", price: 78.59, change: -0.16, decimals: 2, drift: 0.05 },
];

const CHART_TOOLS = [
  { icon: Crosshair, label: "Crosshair" },
  { icon: TrendingUp, label: "Trend line" },
  { icon: Layers3, label: "Fib retracement" },
  { icon: Spline, label: "Pattern" },
  { icon: MoveDiagonal, label: "Parallel channel" },
  { icon: Brush, label: "Brush" },
  { icon: Type, label: "Text" },
  { icon: Ruler, label: "Measure" },
  { icon: ZoomIn, label: "Zoom" },
  { icon: Magnet, label: "Magnet" },
  { icon: Eye, label: "Hide drawings" },
  { icon: Trash2, label: "Remove drawings" },
] as const;

function money(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function ViewerAvatar() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-card-soft">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="13" r="6" fill="none" stroke="currentColor" />
        <path d="M5 29c1.6-6 5.8-9 11-9s9.4 3 11 9" fill="none" stroke="currentColor" />
        <path d="M12 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" fill="none" stroke="currentColor" strokeWidth=".8" />
      </svg>
    </span>
  );
}

export function ViewerWorkspace() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeTool, setActiveTool] = useState(0);

  useEffect(() => {
    if (window.localStorage.getItem("voltis-theme") === "dark") {
      queueMicrotask(() => setTheme("dark"));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voltis-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Deterministic demo bars (seeded), shifted so the position sits "live": the
  // last close lands a touch above entry, i.e. a small unrealized profit. A deep
  // block of older bars is spliced onto the front — matched in price and time at
  // the seam — so viewers can scroll back through weeks of history continuously
  // (fixLeftEdge keeps it void-free) without altering the recent candles or any
  // of the position numbers.
  const { bars, current, entryTime } = useMemo(() => {
    const step = 30 * 60;
    const raw = generateMarketBars("NQ", "30m", 220);
    const shift = TRADE.entry + 25.5 - raw[raw.length - 1].close;
    const recent = raw.map((bar) => ({
      ...bar,
      open: bar.open + shift,
      high: bar.high + shift,
      low: bar.low + shift,
      close: bar.close + shift,
    }));

    // Older history: a longer demo run, re-priced so its final close meets the
    // first recent open, and re-timed to sit immediately before it.
    const olderRaw = generateMarketBars("NQ", "30m", 1300);
    const olderShift = recent[0].open - olderRaw[olderRaw.length - 1].close;
    const older = olderRaw.slice(0, -1).map((bar, index, arr) => ({
      open: bar.open + olderShift,
      high: bar.high + olderShift,
      low: bar.low + olderShift,
      close: bar.close + olderShift,
      volume: bar.volume,
      time: recent[0].time - (arr.length - index) * step,
    }));
    const merged = [...older, ...recent];

    // Pin the entry marker to the recent bar nearest the entry price.
    let entryIdx = merged.length - 8;
    let best = Infinity;
    for (let i = Math.max(0, merged.length - 36); i < merged.length - 2; i += 1) {
      const diff = Math.abs(merged[i].close - TRADE.entry);
      if (diff < best) {
        best = diff;
        entryIdx = i;
      }
    }
    return {
      bars: merged,
      current: merged[merged.length - 1].close,
      entryTime: merged[entryIdx].time,
    };
  }, []);

  const trade = useMemo<ChartTrade>(
    () => ({
      side: TRADE.side,
      quantity: TRADE.quantity,
      entry: TRADE.entry,
      takeProfit: TRADE.takeProfit,
      stopLoss: TRADE.stopLoss,
      entryTime,
    }),
    [entryTime],
  );

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const change = lastBar && prevBar ? lastBar.close - prevBar.close : 0;
  const changePct = prevBar ? (change / prevBar.close) * 100 : 0;
  const ema20 = useMemo(() => computeEma(bars, 20), [bars]);
  const ema50 = useMemo(() => computeEma(bars, 50), [bars]);

  const pnl = (current - TRADE.entry) * TRADE.quantity * TRADE.multiplier;
  const margin = (TRADE.entry * TRADE.quantity * TRADE.multiplier) / TRADE.leverage;
  const pnlPct = (pnl / margin) * 100;

  const quotes = useMemo(
    () => TICKER_QUOTES.map((q) => (q.symbol === "NQ1!" ? { ...q, price: current } : q)),
    [current],
  );

  return (
    <BootProvider value={{ active: false, phase: "done" }}>
      <main
        data-theme={theme}
        className="vw relative flex h-dvh min-w-[1280px] flex-col overflow-hidden"
      >
        {/* ----- top bar ----- */}
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-panel px-6">
          <button
            onClick={() => window.location.assign("/")}
            aria-label="Voltis home"
            className="text-[21px] font-semibold tracking-[-0.04em] transition-opacity hover:opacity-70"
          >
            Voltis
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() =>
                setTheme((current) => (current === "light" ? "dark" : "light"))
              }
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              className="v-press grid h-9 w-9 place-items-center rounded-xl border border-line bg-card text-ink"
              style={theme === "dark" ? { boxShadow: "var(--glow)" } : undefined}
            >
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            <Dropdown
              align="right"
              menuClassName="w-56"
              className="h-9 w-12 justify-center"
              label={
                <span className="relative">
                  <Bell size={15} />
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-down" />
                </span>
              }
            >
              <div className="px-3 py-2.5">
                <p className="text-[10px] font-medium">Notifications</p>
                <p className="mt-1.5 text-[9px] leading-4 text-ink-2">
                  Yazan opened a new NQ long — 4 contracts at 29,332.50.
                </p>
              </div>
            </Dropdown>

            <Dropdown
              align="right"
              menuClassName="w-44"
              className="h-11 px-2.5"
              label={
                <span className="flex items-center gap-2.5">
                  <ViewerAvatar />
                  <span className="text-left">
                    <span className="block text-[11px] font-medium leading-tight">
                      Yazan
                    </span>
                    <span className="flex items-center gap-1 text-[8px] text-ink-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-up" />
                      Pro
                    </span>
                  </span>
                </span>
              }
            >
              {(close) => (
                <>
                  <MenuItem
                    onSelect={() => {
                      close();
                      window.location.assign("/login");
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <LogIn size={14} />
                      Sign in
                    </span>
                  </MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        {/* ----- ticker strip ----- */}
        <div className="shrink-0">
          <TickerStrip quotes={quotes} />
        </div>

        {/* ----- body ----- */}
        <section className="flex min-h-0 flex-1">
          {/* left column: heading + chart */}
          <div className="flex min-w-0 flex-1 flex-col px-5 pb-4">
            <div className="flex shrink-0 items-center gap-3 pb-3 pt-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em]">
                Overview
              </h1>
              <span className="ml-1 grid grid-cols-3 gap-[2px]">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span
                    key={index}
                    className="h-[2.5px] w-[2.5px] rounded-full bg-ink-3"
                  />
                ))}
              </span>
              <span className="text-[10px] text-ink-2">NQ Trading</span>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-card">
              {/* tool rail (read-only) */}
              <aside className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line py-2">
                {CHART_TOOLS.map((tool, index) => (
                  <button
                    key={tool.label}
                    onClick={() => setActiveTool(index)}
                    aria-label={tool.label}
                    title={tool.label}
                    className={cn(
                      "v-press grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                      activeTool === index
                        ? "bg-card-soft text-[#4b8ee8]"
                        : "text-ink-2 hover:bg-card-soft hover:text-ink",
                    )}
                  >
                    <tool.icon size={15} />
                  </button>
                ))}
              </aside>

              {/* chart + legend */}
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute left-3 top-2.5 z-20 select-none">
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="font-semibold text-ink">
                      {TRADE.symbol} · 30m · {TRADE.exchange}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-up" />
                    {lastBar ? (
                      <span className="flex items-center gap-1.5 tabular-nums">
                        <span className="text-ink-2">
                          O <span className="text-up">{money(lastBar.open)}</span>
                        </span>
                        <span className="text-ink-2">
                          H <span className="text-up">{money(lastBar.high)}</span>
                        </span>
                        <span className="text-ink-2">
                          L <span className="text-up">{money(lastBar.low)}</span>
                        </span>
                        <span className="text-ink-2">
                          C <span className="text-up">{money(lastBar.close)}</span>
                        </span>
                        <span className={cn(change >= 0 ? "text-up" : "text-down")}>
                          {change >= 0 ? "+" : ""}
                          {change.toFixed(2)} ({change >= 0 ? "+" : ""}
                          {changePct.toFixed(2)}%)
                        </span>
                      </span>
                    ) : null}
                  </div>
                  {ema20.length > 0 ? (
                    <p className="mt-1 font-mono text-[9px] text-ink-2">
                      EMA 20 close{" "}
                      <span className="text-[#2ba98f]">
                        {money(ema20[ema20.length - 1].value)}
                      </span>
                    </p>
                  ) : null}
                  {ema50.length > 0 ? (
                    <p className="mt-0.5 font-mono text-[9px] text-ink-2">
                      EMA 50 close{" "}
                      <span className="text-ink-3">
                        {money(ema50[ema50.length - 1].value)}
                      </span>
                    </p>
                  ) : null}
                </div>

                <MarketChart
                  bars={bars}
                  family="NQ"
                  timeframe="30m"
                  fibs={[]}
                  dataLabel="LIVE PREVIEW"
                  theme={theme}
                  trade={trade}
                  readOnly
                  onUpdateFib={() => {}}
                />
              </div>
            </div>
          </div>

          {/* right column: open trades */}
          <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
                Open Trades
              </h2>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-chip px-1.5 text-[10px] font-semibold text-chip-ink">
                1
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <article className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[12px] font-semibold">
                    {TRADE.symbol} · {TRADE.exchange}
                  </p>
                  <span className="rounded-md bg-up-soft px-2 py-0.5 text-[10px] font-semibold text-up">
                    {TRADE.side === "long" ? "Long" : "Short"}
                  </span>
                </div>

                <dl className="mt-4 space-y-3 text-[11px]">
                  <Row label="Quantity" value={`${TRADE.quantity} Contracts`} />
                  <Row label="Entry Price" value={money(TRADE.entry)} mono />
                  <Row label="Current Price" value={money(current)} mono />
                </dl>

                <div className="mt-4 space-y-3 border-t border-line pt-4 text-[11px]">
                  <Row
                    label="Stop Loss"
                    labelClass="text-down"
                    value={money(TRADE.stopLoss)}
                    mono
                  />
                  <Row
                    label="Take Profit"
                    labelClass="text-up"
                    value={money(TRADE.takeProfit)}
                    mono
                  />
                </div>

                <div className="mt-4 flex items-start justify-between border-t border-line pt-4">
                  <span className="text-[11px] text-ink-2">Unrealized P&amp;L</span>
                  <span className="text-right">
                    <span
                      className={cn(
                        "block font-mono text-[13px] font-semibold tabular-nums",
                        pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {pnl >= 0 ? "+" : "-"}
                      {money(Math.abs(pnl))} USD
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block font-mono text-[10px] tabular-nums",
                        pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      ({pnl >= 0 ? "+" : "-"}
                      {Math.abs(pnlPct).toFixed(2)}%)
                    </span>
                  </span>
                </div>

                <div className="mt-4 space-y-3 border-t border-line pt-4 text-[11px]">
                  <Row label="Opened" value={TRADE.openedLabel} mono />
                  <div className="flex items-center justify-between">
                    <span className="text-ink-2">Status</span>
                    <span className="flex items-center gap-1.5 font-medium text-up">
                      <span className="h-1.5 w-1.5 rounded-full bg-up" />
                      Open
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </main>
    </BootProvider>
  );
}

function Row({
  label,
  value,
  mono = false,
  labelClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  labelClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-ink-2", labelClass)}>{label}</dt>
      <dd className={cn("text-ink", mono && "font-mono tabular-nums")}>{value}</dd>
    </div>
  );
}
