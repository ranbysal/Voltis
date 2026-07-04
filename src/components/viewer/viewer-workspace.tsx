"use client";

import {
  Bell,
  Crosshair,
  Eye,
  EyeOff,
  LogIn,
  Moon,
  Ruler,
  Sun,
  ZoomIn,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { computeEma, MarketChart, type ChartTrade } from "@/components/market-chart";
import { BootProvider } from "@/components/transition/boot-context";
import { TickerStrip, type TickerQuote } from "@/components/workspace/ticker-strip";
import { Dropdown, MenuItem } from "@/components/workspace/ui";
import type { FibDrawing, MarketBar } from "@/lib/domain";
import { applyLiveBar, timeframeBucketStart } from "@/lib/market-aggregation";
import { generateMarketBars } from "@/lib/market";
import { barCountFor } from "@/lib/market-data";
import { cn } from "@/lib/utils";

/** Open trade as served by /api/public/state. */
type PublicTrade = {
  id: string;
  family: "NQ" | "YM" | "GC";
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  mode: "paper" | "demo" | "live";
  openedAt: string;
};

type PublicState = {
  available: boolean;
  trades: PublicTrade[];
  fibs: FibDrawing[];
};

const FAMILY = "NQ" as const;
const TIMEFRAME = "30m" as const;
const EXCHANGE = "CME";

/** $ per index point per contract, by display symbol root. */
const POINT_VALUE: Record<string, number> = {
  "NQ1!": 20,
  "MNQ1!": 2,
  "YM1!": 5,
  "MYM1!": 0.5,
  "GC1!": 100,
  "MGC1!": 10,
};

const TICKER_QUOTES: TickerQuote[] = [
  { symbol: "NQ1!", price: 22_021, change: 11.2, decimals: 2, drift: 1.25 },
  { symbol: "YM1!", price: 38_643, change: 60.4, decimals: 2, drift: 4 },
  { symbol: "ES1!", price: 5_236.09, change: 9.59, decimals: 2, drift: 0.5 },
  { symbol: "GC1!", note: "(Gold)", price: 2_329.21, change: 10.11, decimals: 2, drift: 0.45 },
  { symbol: "SI1!", note: "(Silver)", price: 27.34, change: 0.26, decimals: 2, drift: 0.02 },
  { symbol: "CL1!", note: "(Oil)", price: 78.59, change: -0.16, decimals: 2, drift: 0.05 },
];

type ViewerTool = "crosshair" | "measure" | "zoom";

function money(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function openedLabel(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} · ${date.toLocaleTimeString("en-US", { hour12: false })}`;
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

type StreamStatus = "unavailable" | "connecting" | "live" | "reconnecting";

export function ViewerWorkspace() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeTool, setActiveTool] = useState<ViewerTool>("crosshair");
  const [showDrawings, setShowDrawings] = useState(true);
  const [bars, setBars] = useState<MarketBar[]>([]);
  const [provider, setProvider] = useState<"demo" | "databento">("demo");
  const [delayed, setDelayed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [publicState, setPublicState] = useState<PublicState | null>(null);
  // Fallback demo presentation, derived ONCE from the first real window so its
  // overlay lines don't wander with every tick.
  const [demoTrade, setDemoTrade] = useState<PublicTrade | null>(null);

  const seenBarTimesRef = useRef<Set<number>>(new Set());
  const olderLoadingRef = useRef(false);
  const pagedBackRef = useRef(false);

  useEffect(() => {
    if (window.localStorage.getItem("voltis-theme") === "dark") {
      queueMicrotask(() => setTheme("dark"));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voltis-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  /* ------------------------- market data plumbing ------------------------ */

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/market/history?family=${FAMILY}&timeframe=${TIMEFRAME}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("history failed");
      }
      const history = (await response.json()) as {
        provider: "demo" | "databento";
        delayed: boolean;
        bars: MarketBar[];
      };
      setBars(history.bars);
      seenBarTimesRef.current = new Set(history.bars.map((bar) => bar.time));
      setProvider(history.provider);
      setDelayed(history.delayed);
      setHasMoreHistory(history.bars.length > 0);
      pagedBackRef.current = false;
      seedDemoTrade(history.bars);
    } catch {
      const demo = generateMarketBars(FAMILY, TIMEFRAME);
      setBars(demo);
      seenBarTimesRef.current = new Set(demo.map((bar) => bar.time));
      setProvider("demo");
      setDelayed(true);
      seedDemoTrade(demo);
    } finally {
      setLoading(false);
    }

    // Anchored to the loaded window once, so the presentation is internally
    // consistent with the chart yet perfectly still between refreshes.
    function seedDemoTrade(loaded: MarketBar[]) {
      if (loaded.length === 0) {
        return;
      }
      const lastClose = loaded[loaded.length - 1].close;
      const entry = Math.round((lastClose - 25.5) / 0.25) * 0.25;
      setDemoTrade((existing) =>
        existing ?? {
          id: "demo",
          family: FAMILY,
          symbol: "NQ1!",
          side: "long",
          quantity: 4,
          entryPrice: entry,
          takeProfit: entry + 337.5,
          stopLoss: entry - 357.5,
          mode: "paper",
          openedAt: new Date(
            (loaded[Math.max(0, loaded.length - 8)]?.time ?? 0) * 1000,
          ).toISOString(),
        },
      );
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadHistory());
  }, [loadHistory]);

  // Back-scroll (same contract as the dashboard: dedupe, one in flight,
  // empty older window = start of history).
  const loadOlderHistory = useCallback(
    async (beforeTime: number) => {
      if (olderLoadingRef.current || !hasMoreHistory) {
        return;
      }
      olderLoadingRef.current = true;
      setLoadingOlder(true);
      try {
        const chunk = Math.min(1500, barCountFor(TIMEFRAME) * 2);
        const response = await fetch(
          `/api/market/history?family=${FAMILY}&timeframe=${TIMEFRAME}&before=${beforeTime}&count=${chunk}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          return;
        }
        const history = (await response.json()) as { bars: MarketBar[] };
        const older = history.bars.filter(
          (bar) =>
            bar.time < beforeTime && !seenBarTimesRef.current.has(bar.time),
        );
        if (older.length === 0) {
          setHasMoreHistory(false);
          return;
        }
        for (const bar of older) {
          seenBarTimesRef.current.add(bar.time);
        }
        pagedBackRef.current = true;
        setBars((current) =>
          [...older, ...current].sort((a, b) => a.time - b.time),
        );
      } catch {
        // transient; the next scroll retries
      } finally {
        olderLoadingRef.current = false;
        setLoadingOlder(false);
      }
    },
    [hasMoreHistory],
  );

  // Live stream (public viewer token). Bars fold into the 30m bucket.
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    async function connect() {
      if (disposed) {
        return;
      }
      setStreamStatus(attempt === 0 ? "connecting" : "reconnecting");
      try {
        const response = await fetch("/api/market/stream-token", {
          method: "POST",
        });
        if (response.status === 503) {
          setStreamStatus("unavailable");
          return;
        }
        if (!response.ok) {
          throw new Error("token failed");
        }
        const body = (await response.json()) as { token: string; url: string };
        const url = new URL(body.url);
        url.searchParams.set("token", body.token);
        socket = new WebSocket(url);

        socket.onopen = () => {
          attempt = 0;
          setStreamStatus("live");
        };
        socket.onmessage = (event) => {
          let message: {
            type: string;
            state?: string;
            family?: string;
            bar?: MarketBar;
          };
          try {
            message = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (message.type === "status") {
            setStreamStatus(message.state === "connected" ? "live" : "reconnecting");
            return;
          }
          if (message.type === "bar" && message.family === FAMILY && message.bar) {
            setDelayed(false);
            setProvider("databento");
            setBars((current) => applyLiveBar(current, message.bar!, TIMEFRAME));
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          if (disposed) {
            return;
          }
          attempt += 1;
          setStreamStatus("reconnecting");
          reconnectTimer = window.setTimeout(
            () => void connect(),
            Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)),
          );
        };
      } catch {
        if (disposed) {
          return;
        }
        attempt += 1;
        setStreamStatus("reconnecting");
        reconnectTimer = window.setTimeout(
          () => void connect(),
          Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)),
        );
      }
    }

    void connect();
    return () => {
      disposed = true;
      socket?.close();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

  // Silent tail refresh while the live stream is down: merge just the latest
  // buckets into the end of the series — no loading state, no window replace,
  // no view shift, and safe mid-back-scroll (older bars are never touched).
  const refreshLatestBars = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/market/history?family=${FAMILY}&timeframe=${TIMEFRAME}&count=10`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return;
      }
      const history = (await response.json()) as {
        provider: string;
        bars: MarketBar[];
      };
      if (history.provider !== "databento" || history.bars.length === 0) {
        return;
      }
      for (const bar of history.bars) {
        seenBarTimesRef.current.add(bar.time);
      }
      setBars((current) => {
        if (current.length === 0) {
          return current;
        }
        const lastTime = current[current.length - 1].time;
        let next: MarketBar[] | null = null;
        for (const bar of history.bars) {
          if (bar.time < lastTime) {
            continue;
          }
          if (bar.time === lastTime) {
            const existing = (next ?? current)[current.length - 1];
            if (
              existing.close !== bar.close ||
              existing.high !== bar.high ||
              existing.low !== bar.low
            ) {
              next = next ?? [...current];
              next[current.length - 1] = bar;
            }
          } else {
            next = next ?? [...current];
            next.push(bar);
          }
        }
        return next ?? current;
      });
    } catch {
      // silent — the next tick retries
    }
  }, []);

  useEffect(() => {
    if (provider !== "databento" || streamStatus === "live") {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshLatestBars();
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [provider, streamStatus, refreshLatestBars]);

  /* --------------------- live public state (trades + fibs) --------------------- */

  useEffect(() => {
    let disposed = false;
    async function poll() {
      try {
        const response = await fetch("/api/public/state", { cache: "no-store" });
        if (response.ok && !disposed) {
          setPublicState((await response.json()) as PublicState);
        }
      } catch {
        // keep the last known state
      }
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 5_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  /* ------------------------------- derived ------------------------------- */

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const current = lastBar?.close ?? 0;
  const change = lastBar && prevBar ? lastBar.close - prevBar.close : 0;
  const changePct = prevBar ? (change / prevBar.close) * 100 : 0;
  const ema20 = useMemo(() => computeEma(bars, 20), [bars]);
  const ema50 = useMemo(() => computeEma(bars, 50), [bars]);

  // Real open trades when the public feed is live; otherwise the single demo
  // presentation seeded from the first loaded window.
  const openTrades = useMemo<PublicTrade[]>(() => {
    if (publicState?.available) {
      return publicState.trades;
    }
    return demoTrade ? [demoTrade] : [];
  }, [publicState, demoTrade]);

  // The chart overlays the most recent open trade on its own family. Built
  // from PRIMITIVE deps so its identity is stable across the 5s state polls
  // and bar ticks — otherwise the Entry/TP/SL price lines and the position
  // marker would detach and re-attach (a visible blink) on every poll.
  const activeTrade = openTrades.find((item) => item.family === FAMILY) ?? null;
  const firstBarTime = bars.length > 0 ? bars[0].time : null;
  const atSide = activeTrade?.side ?? null;
  const atQuantity = activeTrade?.quantity ?? 0;
  const atEntry = activeTrade?.entryPrice ?? 0;
  const atTakeProfit = activeTrade?.takeProfit ?? null;
  const atStopLoss = activeTrade?.stopLoss ?? null;
  const atOpenedAt = activeTrade?.openedAt ?? null;
  const chartTrade = useMemo<ChartTrade | null>(() => {
    if (atSide === null || atOpenedAt === null || firstBarTime === null) {
      return null;
    }
    const bucket = timeframeBucketStart(
      Math.floor(new Date(atOpenedAt).getTime() / 1000),
      TIMEFRAME,
    );
    return {
      side: atSide,
      quantity: atQuantity,
      entry: atEntry,
      takeProfit: atTakeProfit,
      stopLoss: atStopLoss,
      entryTime: Math.max(bucket, firstBarTime),
    };
  }, [atSide, atQuantity, atEntry, atTakeProfit, atStopLoss, atOpenedAt, firstBarTime]);

  // Admin fib drawings for this chart, honoring the visitor's toggle.
  const viewerFibs = useMemo<FibDrawing[]>(() => {
    if (!showDrawings || !publicState?.available) {
      return [];
    }
    return publicState.fibs.filter(
      (fib) => fib.family === FAMILY && fib.visible,
    );
  }, [publicState, showDrawings]);

  const quotes = useMemo(
    () =>
      TICKER_QUOTES.map((quote) =>
        quote.symbol === "NQ1!" && current > 0
          ? { ...quote, price: current }
          : quote,
      ),
    [current],
  );

  const dataLabel =
    provider === "databento"
      ? streamStatus === "live" && !delayed
        ? "DATABENTO LIVE"
        : "DATABENTO HISTORICAL"
      : loading
        ? "CONNECTING LIVE DATA"
        : "DETERMINISTIC DEMO FEED";

  const rail: {
    id: ViewerTool | "drawings";
    icon: typeof Crosshair;
    label: string;
  }[] = [
    { id: "crosshair", icon: Crosshair, label: "Crosshair" },
    { id: "measure", icon: Ruler, label: "Measure" },
    { id: "zoom", icon: ZoomIn, label: "Zoom" },
    {
      id: "drawings",
      icon: showDrawings ? Eye : EyeOff,
      label: showDrawings ? "Hide fib drawings" : "Show fib drawings",
    },
  ];

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
            className="v-serif text-[20px] tracking-[0.2em] text-ink transition-opacity hover:opacity-70"
          >
            VOLTIS
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() =>
                setTheme((value) => (value === "light" ? "dark" : "light"))
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
                  {openTrades.length > 0
                    ? `Yazan has ${openTrades.length} open position${openTrades.length === 1 ? "" : "s"} — watch them live on this page.`
                    : "No open positions right now — new trades appear here live."}
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
              )}
            </Dropdown>
          </div>
        </header>

        {/* ----- ticker strip ----- */}
        <div className="shrink-0">
          <TickerStrip quotes={quotes} livePrice={current > 0 ? current : null} />
        </div>

        {/* ----- body ----- */}
        <section className="flex min-h-0 flex-1">
          {/* left column: heading + chart */}
          <div className="flex min-w-0 flex-1 flex-col px-5 pb-4">
            <div className="flex shrink-0 items-center gap-3 pb-3 pt-4">
              <h1 className="v-serif text-[30px] leading-none text-ink">
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
              {/* tool rail — every control does something */}
              <aside className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line py-2">
                {rail.map((tool) => {
                  const active =
                    tool.id === "drawings" ? showDrawings : activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() =>
                        tool.id === "drawings"
                          ? setShowDrawings((value) => !value)
                          : setActiveTool(tool.id as ViewerTool)
                      }
                      aria-label={tool.label}
                      title={tool.label}
                      className={cn(
                        "v-press grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                        active
                          ? "bg-card-soft text-[#4b8ee8]"
                          : "text-ink-2 hover:bg-card-soft hover:text-ink",
                      )}
                    >
                      <tool.icon size={15} />
                    </button>
                  );
                })}
              </aside>

              {/* chart + legend */}
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute left-3 top-2.5 z-20 select-none">
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="font-semibold text-ink">
                      NQ1! · {TIMEFRAME} · {EXCHANGE}
                    </span>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        loading ? "animate-pulse bg-[#d7a33f]" : "bg-up",
                      )}
                    />
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
                  family={FAMILY}
                  timeframe={TIMEFRAME}
                  fibs={viewerFibs}
                  dataLabel={dataLabel}
                  theme={theme}
                  trade={showDrawings ? chartTrade : null}
                  readOnly
                  tool={activeTool}
                  onLoadOlder={(oldestTime) => void loadOlderHistory(oldestTime)}
                  canLoadOlder={hasMoreHistory && !loading}
                  isLoadingOlder={loadingOlder}
                  onUpdateFib={() => {}}
                />
              </div>
            </div>
          </div>

          {/* right column: open trades */}
          <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <h2 className="v-serif text-[19px] leading-none text-ink">
                Open Trades
              </h2>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-chip px-1.5 text-[10px] font-semibold text-chip-ink">
                {openTrades.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
              {openTrades.length === 0 ? (
                <div className="rounded-xl border border-line bg-card p-4 text-[11px] text-ink-2">
                  No open trades right now — Yazan&apos;s next position will
                  appear here the moment it opens.
                </div>
              ) : (
                openTrades.map((trade) => {
                  const pointValue = POINT_VALUE[trade.symbol] ?? 20;
                  const sign = trade.side === "long" ? 1 : -1;
                  const mark =
                    trade.family === FAMILY && current > 0
                      ? current
                      : trade.entryPrice;
                  const pnl =
                    (mark - trade.entryPrice) * sign * trade.quantity * pointValue;
                  const margin =
                    (trade.entryPrice * trade.quantity * pointValue) / 20;
                  const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
                  return (
                    <article
                      key={trade.id}
                      className="rounded-xl border border-line bg-card p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[12px] font-semibold">
                          {trade.symbol} ·{" "}
                          {trade.family === "NQ"
                            ? "CME"
                            : trade.family === "YM"
                              ? "CBOT"
                              : "COMEX"}
                        </p>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                            trade.side === "long"
                              ? "bg-up-soft text-up"
                              : "bg-down-soft text-down",
                          )}
                        >
                          {trade.side === "long" ? "Long" : "Short"}
                        </span>
                      </div>

                      <dl className="mt-4 space-y-3 text-[11px]">
                        <Row
                          label="Quantity"
                          value={`${trade.quantity} Contract${trade.quantity === 1 ? "" : "s"}`}
                        />
                        <Row label="Entry Price" value={money(trade.entryPrice)} mono />
                        <Row label="Current Price" value={money(mark)} mono />
                      </dl>

                      <div className="mt-4 space-y-3 border-t border-line pt-4 text-[11px]">
                        <Row
                          label="Stop Loss"
                          labelClass="text-down"
                          value={trade.stopLoss !== null ? money(trade.stopLoss) : "—"}
                          mono
                        />
                        <Row
                          label="Take Profit"
                          labelClass="text-up"
                          value={
                            trade.takeProfit !== null ? money(trade.takeProfit) : "—"
                          }
                          mono
                        />
                      </div>

                      <div className="mt-4 flex items-start justify-between border-t border-line pt-4">
                        <span className="text-[11px] text-ink-2">
                          Unrealized P&amp;L
                        </span>
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
                        <Row label="Opened" value={openedLabel(trade.openedAt)} mono />
                        <div className="flex items-center justify-between">
                          <span className="text-ink-2">Status</span>
                          <span className="flex items-center gap-1.5 font-medium text-up">
                            <span className="h-1.5 w-1.5 rounded-full bg-up" />
                            Open
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
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
