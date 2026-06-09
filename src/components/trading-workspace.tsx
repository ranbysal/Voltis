"use client";

import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Crosshair,
  Eye,
  EyeOff,
  Grid2X2,
  Layers3,
  Lock,
  Maximize2,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Unlock,
  Zap,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_WORKSPACE,
  TIMEFRAMES,
  executionTicker,
  fibPrice,
  type FibDirection,
  type FibDrawing,
  type MarketBar,
  type SymbolFamily,
  type Timeframe,
  type WorkspaceState,
} from "@/lib/domain";
import { ApiExecutionProvider } from "@/lib/execution";
import type { MarketDataMeta } from "@/lib/market-data";
import { applyLiveBar } from "@/lib/market-aggregation";
import {
  detectFibAnchors,
  generateMarketBars,
  tickLastBar,
} from "@/lib/market";
import {
  hasSavedWorkspace,
  loadCloudWorkspace,
  loadWorkspace,
  saveCloudWorkspace,
  saveWorkspace,
} from "@/lib/persistence";
import { cn } from "@/lib/utils";
import { MarketChart } from "@/components/market-chart";

const provider = new ApiExecutionProvider();
type MarketStreamStatus =
  | "unavailable"
  | "connecting"
  | "live"
  | "reconnecting";
type MarketStreamMessage =
  | {
      type: "bar";
      family: SymbolFamily;
      activeContract: string;
      bar: MarketBar;
    }
  | {
      type: "mapping";
      family: SymbolFamily;
      activeContract: string;
    }
  | {
      type: "status";
      state: "connected" | "reconnecting";
    }
  | {
      type: "heartbeat";
    };

const DEFAULT_MARKET_META: MarketDataMeta = {
  provider: "demo",
  session: "ETH",
  adjustment: "back-adjusted",
  continuousSymbol: "YM.v.0",
  activeContract: "YMM6",
  delayed: true,
  sourceSchema: "ohlcv-1m",
};

const FAMILY_DETAILS: Record<
  SymbolFamily,
  { name: string; exchange: string }
> = {
  YM: {
    name: "E-mini Dow Jones Futures",
    exchange: "CBOT",
  },
  NQ: {
    name: "E-mini Nasdaq-100 Futures",
    exchange: "CME",
  },
};

const FIB_OPACITY: Record<Timeframe, number> = {
  "5m": 100,
  "10m": 94,
  "30m": 88,
  "1h": 80,
  "4h": 72,
  "1d": 60,
  "3d": 50,
  "1w": 40,
  "1M": 32,
};

function createFib(
  family: SymbolFamily,
  timeframe: Timeframe,
  direction: FibDirection,
): FibDrawing | null {
  const anchors = detectFibAnchors(
    generateMarketBars(family, timeframe),
    direction,
  );
  if (!anchors) {
    return null;
  }

  return {
    id: nanoid(),
    family,
    timeframe,
    direction,
    ...anchors,
    visible: true,
    locked: false,
    manual: false,
    updatedAt: new Date().toISOString(),
  };
}

function seededFibs(family: SymbolFamily) {
  return [
    createFib(family, "1w", "buy"),
    createFib(family, "1d", "buy"),
    createFib(family, "4h", "sell"),
  ].filter((fib): fib is FibDrawing => fib !== null);
}

function formatPrice(value: number, family: SymbolFamily) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: family === "YM" ? 0 : 2,
    maximumFractionDigits: family === "YM" ? 0 : 2,
  });
}

export function TradingWorkspace() {
  const [workspace, setWorkspace] =
    useState<WorkspaceState>(DEFAULT_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);
  const [bars, setBars] = useState(() =>
    generateMarketBars("YM", "30m"),
  );
  const [marketMeta, setMarketMeta] =
    useState<MarketDataMeta>(DEFAULT_MARKET_META);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketStreamStatus, setMarketStreamStatus] =
    useState<MarketStreamStatus>("connecting");
  const [compactViewport, setCompactViewport] = useState(false);
  const [armed, setArmed] = useState(false);
  const [paperMessage, setPaperMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [panelMode, setPanelMode] = useState<"fibs" | "trade">("fibs");
  const [selectedAccounts, setSelectedAccounts] = useState([
    "Apex 50K",
    "Take Profit 50K",
  ]);
  const clockRef = useRef<HTMLSpanElement>(null);
  const historyRequestRef = useRef(0);
  const activeContractRef = useRef(DEFAULT_MARKET_META.activeContract);
  const selectionRef = useRef({
    family: DEFAULT_WORKSPACE.family,
    timeframe: DEFAULT_WORKSPACE.timeframe,
  });

  const loadMarketHistory = useCallback(
    async (family: SymbolFamily, timeframe: Timeframe) => {
      const requestId = historyRequestRef.current + 1;
      historyRequestRef.current = requestId;
      setMarketLoading(true);

      try {
        const response = await fetch(
          `/api/market/history?family=${family}&timeframe=${timeframe}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error("Market history request failed");
        }
        const history = (await response.json()) as MarketDataMeta & {
          bars: typeof bars;
        };
        if (historyRequestRef.current !== requestId) {
          return;
        }
        setBars(history.bars);
        activeContractRef.current = history.activeContract;
        setMarketMeta({
          provider: history.provider,
          session: history.session,
          adjustment: history.adjustment,
          continuousSymbol: history.continuousSymbol,
          activeContract: history.activeContract,
          delayed: history.delayed,
          sourceSchema: history.sourceSchema,
        });
      } catch {
        if (historyRequestRef.current !== requestId) {
          return;
        }
        setBars(generateMarketBars(family, timeframe));
        activeContractRef.current = `${family}M6`;
        setMarketMeta({
          ...DEFAULT_MARKET_META,
          continuousSymbol: `${family}.v.0`,
          activeContract: `${family}M6`,
        });
      } finally {
        if (historyRequestRef.current === requestId) {
          setMarketLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const stored = hasSavedWorkspace();
    const next = loadWorkspace();
    queueMicrotask(() => {
      setWorkspace({
        ...next,
        fibs: stored ? next.fibs : seededFibs(next.family),
      });
      void loadMarketHistory(next.family, next.timeframe);
      setHydrated(true);
    });

    void loadCloudWorkspace().then((cloudState) => {
      if (cloudState) {
        setWorkspace(cloudState);
        void loadMarketHistory(cloudState.family, cloudState.timeframe);
      }
    });
  }, [loadMarketHistory]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompactViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveWorkspace(workspace);
    }
    const cloudSave = window.setTimeout(() => {
      if (hydrated) {
        void saveCloudWorkspace(workspace);
      }
    }, 600);
    return () => window.clearTimeout(cloudSave);
  }, [hydrated, workspace]);

  useEffect(() => {
    selectionRef.current = {
      family: workspace.family,
      timeframe: workspace.timeframe,
    };
  }, [workspace.family, workspace.timeframe]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    const seenBars = new Set<string>();

    async function connect() {
      if (disposed) {
        return;
      }

      setMarketStreamStatus(
        reconnectAttempt === 0 ? "connecting" : "reconnecting",
      );

      try {
        const response = await fetch("/api/market/stream-token", {
          method: "POST",
        });
        if (response.status === 503) {
          setMarketStreamStatus("unavailable");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to authorize live market stream");
        }

        const body = (await response.json()) as {
          token: string;
          url: string;
        };
        const url = new URL(body.url);
        url.searchParams.set("token", body.token);
        socket = new WebSocket(url);

        socket.onopen = () => {
          reconnectAttempt = 0;
          setMarketStreamStatus("live");
        };
        socket.onmessage = (event) => {
          let message: MarketStreamMessage;
          try {
            message = JSON.parse(String(event.data)) as MarketStreamMessage;
          } catch {
            return;
          }

          if (message.type === "status") {
            setMarketStreamStatus(
              message.state === "connected" ? "live" : "reconnecting",
            );
            return;
          }
          if (message.type === "heartbeat") {
            return;
          }

          if (message.family !== selectionRef.current.family) {
            return;
          }

          const contractChanged =
            message.activeContract !== activeContractRef.current;
          activeContractRef.current = message.activeContract;
          setMarketMeta((current) => ({
            ...current,
            provider: "databento",
            delayed: false,
            sourceSchema: "ohlcv-1m",
            continuousSymbol: `${message.family}.v.0`,
            activeContract: message.activeContract,
          }));

          if (message.type === "mapping" && contractChanged) {
            void loadMarketHistory(
              selectionRef.current.family,
              selectionRef.current.timeframe,
            );
            return;
          }

          if (message.type === "bar") {
            const key = `${message.family}:${message.bar.time}`;
            if (seenBars.has(key)) {
              return;
            }
            seenBars.add(key);
            if (seenBars.size > 2_000) {
              const first = seenBars.values().next().value;
              if (first) {
                seenBars.delete(first);
              }
            }
            setBars((current) =>
              applyLiveBar(
                current,
                message.bar,
                selectionRef.current.timeframe,
              ),
            );
          }
        };
        socket.onerror = () => {
          socket?.close();
        };
        socket.onclose = () => {
          if (disposed) {
            return;
          }
          reconnectAttempt += 1;
          setMarketStreamStatus("reconnecting");
          reconnectTimer = window.setTimeout(
            () => void connect(),
            Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt, 5)),
          );
        };
      } catch {
        if (disposed) {
          return;
        }
        reconnectAttempt += 1;
        setMarketStreamStatus("reconnecting");
        reconnectTimer = window.setTimeout(
          () => void connect(),
          Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt, 5)),
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
  }, [hydrated, loadMarketHistory]);

  useEffect(() => {
    if (marketMeta.provider !== "demo") {
      return;
    }
    let livePhase = 0;
    const interval = window.setInterval(() => {
      livePhase += 1;
      setBars((current) =>
        tickLastBar(current, workspace.family, livePhase),
      );
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [marketMeta.provider, workspace.family]);

  useEffect(() => {
    if (
      !hydrated ||
      marketMeta.provider !== "databento" ||
      marketStreamStatus === "live"
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadMarketHistory(workspace.family, workspace.timeframe);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [
    hydrated,
    loadMarketHistory,
    marketMeta.provider,
    marketStreamStatus,
    workspace.family,
    workspace.timeframe,
  ]);

  useEffect(() => {
    const updateClock = () => {
      if (clockRef.current) {
        clockRef.current.textContent = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "America/New_York",
        }).format(new Date());
      }
    };
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!armed) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setArmed(false);
    }, 60_000);
    return () => window.clearTimeout(timeout);
  }, [armed]);

  useEffect(() => {
    if (!hydrated || bars.length < 50) {
      return;
    }

    queueMicrotask(() => {
      setWorkspace((current) => {
        let changed = false;
        const fibs = current.fibs.map((fib) => {
          if (
            fib.family !== current.family ||
            fib.timeframe !== current.timeframe ||
            fib.locked ||
            fib.manual
          ) {
            return fib;
          }

          const anchors = detectFibAnchors(bars, fib.direction);
          if (
            !anchors ||
            (anchors.start.time === fib.start.time &&
              anchors.start.price === fib.start.price &&
              anchors.end.time === fib.end.time &&
              anchors.end.price === fib.end.price)
          ) {
            return fib;
          }

          changed = true;
          return {
            ...fib,
            ...anchors,
            updatedAt: new Date().toISOString(),
          };
        });

        return changed ? { ...current, fibs } : current;
      });
    });
  }, [bars, hydrated]);

  const visibleFibs = useMemo(
    () =>
      workspace.fibs.filter(
        (fib) => fib.family === workspace.family && fib.visible,
      ),
    [workspace.family, workspace.fibs],
  );
  const familyFibs = useMemo(
    () =>
      workspace.fibs
        .filter((fib) => fib.family === workspace.family)
        .sort(
          (a, b) =>
            TIMEFRAMES.indexOf(a.timeframe) -
              TIMEFRAMES.indexOf(b.timeframe) ||
            a.direction.localeCompare(b.direction),
        ),
    [workspace.family, workspace.fibs],
  );

  const lastBar = bars[bars.length - 1];
  const firstVisibleBar = bars[Math.max(0, bars.length - 150)];
  const sessionMove = lastBar
    ? ((lastBar.close - firstVisibleBar.close) / firstVisibleBar.close) *
      100
    : 0;
  const ticker = executionTicker(
    workspace.family,
    workspace.executionSize,
  );
  function patchWorkspace(patch: Partial<WorkspaceState>) {
    setWorkspace((current) => ({ ...current, ...patch }));
  }

  function selectFamily(family: SymbolFamily) {
    patchWorkspace({ family });
    void loadMarketHistory(family, workspace.timeframe);
    setPaperMessage(null);
  }

  function selectTimeframe(timeframe: Timeframe) {
    patchWorkspace({ timeframe });
    void loadMarketHistory(workspace.family, timeframe);
    setPaperMessage(null);
  }

  function updateFib(id: string, patch: Partial<FibDrawing>) {
    setWorkspace((current) => ({
      ...current,
      fibs: current.fibs.map((fib) =>
        fib.id === id ? { ...fib, ...patch } : fib,
      ),
    }));
  }

  function addFib(direction: FibDirection) {
    const anchors = detectFibAnchors(bars, direction);
    if (!anchors) {
      setPaperMessage("At least 50 bars are required to create this fib.");
      return;
    }

    setWorkspace((current) => {
      const replacement: FibDrawing = {
        id: nanoid(),
        family: current.family,
        timeframe: current.timeframe,
        direction,
        ...anchors,
        visible: true,
        locked: false,
        manual: false,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...current,
        fibs: [
          ...current.fibs.filter(
            (fib) =>
              !(
                fib.family === current.family &&
                fib.timeframe === current.timeframe &&
                fib.direction === direction
              ),
          ),
          replacement,
        ],
      };
    });
  }

  async function refreshFib(fib: FibDrawing) {
    let source = bars;
    if (
      fib.timeframe !== workspace.timeframe ||
      fib.family !== workspace.family
    ) {
      try {
        const response = await fetch(
          `/api/market/history?family=${fib.family}&timeframe=${fib.timeframe}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error("Unable to refresh fib history");
        }
        source = ((await response.json()) as { bars: typeof bars }).bars;
      } catch {
        source = generateMarketBars(fib.family, fib.timeframe);
      }
    }
    const anchors = detectFibAnchors(source, fib.direction);
    if (anchors) {
      updateFib(fib.id, {
        ...anchors,
        locked: false,
        manual: false,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async function submitPaperOrder(action: "buy" | "sell") {
    if (!armed || !lastBar || selectedAccounts.length === 0) {
      return;
    }

    setSubmitting(true);
    setPaperMessage(null);
    const result = await provider.submit({
      ticker,
      action,
      quantity: workspace.quantity,
      targets: selectedAccounts,
      orderType: "market",
      signalPrice: lastBar.close,
      stopLossPoints: workspace.stopLoss,
      takeProfitPoints: workspace.takeProfit,
      time: new Date().toISOString(),
      test: true,
      idempotencyKey: nanoid(),
    });
    setSubmitting(false);
    setPaperMessage(
      result.accepted
        ? `${result.message} across ${selectedAccounts.length} account(s).`
        : result.message,
    );
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const dataLabel =
    marketMeta.provider === "databento"
      ? `DATABENTO ${marketMeta.delayed ? "HISTORICAL" : "LIVE"}`
      : marketStreamStatus === "unavailable"
        ? "DETERMINISTIC DEMO FEED"
        : "CONNECTING LIVE DATA";

  if (compactViewport) {
    return (
      <main className="min-h-dvh bg-[#050609] text-[#f3f5f7]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.07] bg-[#080a0e]/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#20c6c9] text-[#041011]">
              <Zap size={16} strokeWidth={2.8} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[-0.03em]">VOLTIS</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#687282]">
                Read-only workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-[8px] text-[#7e8998]">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  marketStreamStatus === "live"
                    ? "bg-[#36d399] shadow-[0_0_8px_#36d399]"
                    : marketStreamStatus === "reconnecting" ||
                        marketStreamStatus === "connecting"
                      ? "animate-pulse bg-[#e0ad54]"
                      : "bg-[#697384]",
                )}
              />
              {marketStreamStatus === "live" ? "LIVE" : "VIEW"}
            </div>
            <button
              title="Sign out"
              onClick={signOut}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#788293] hover:bg-white/[0.05] hover:text-white"
            >
              <CircleUserRound size={16} />
            </button>
          </div>
        </header>

        <section className="border-b border-white/[0.07] bg-[#080a0e] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">
                  {workspace.family}1!
                </span>
                <span className="rounded bg-[#151a21] px-1.5 py-0.5 font-mono text-[8px] text-[#6f7988]">
                  {FAMILY_DETAILS[workspace.family].exchange}
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-[#687282]">
                {FAMILY_DETAILS[workspace.family].name}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-medium tabular-nums">
                {lastBar ? formatPrice(lastBar.close, workspace.family) : "--"}
              </p>
              <p
                className={cn(
                  "font-mono text-[9px]",
                  sessionMove >= 0 ? "text-[#3bd9a0]" : "text-[#ff5976]",
                )}
              >
                {sessionMove >= 0 ? "+" : ""}
                {sessionMove.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {(["YM", "NQ"] as const).map((family) => (
              <button
                key={family}
                onClick={() => selectFamily(family)}
                className={cn(
                  "h-8 flex-1 rounded-md border border-white/[0.07] font-mono text-[10px] font-semibold text-[#697384]",
                  workspace.family === family &&
                    "border-[#2ccdd0]/20 bg-[#20c6c9]/10 text-[#55dfe1]",
                )}
              >
                {family}
              </button>
            ))}
          </div>
        </section>

        <div className="overflow-x-auto border-b border-white/[0.07] bg-[#080a0e] px-3 py-2">
          <div className="flex min-w-max gap-1">
            {TIMEFRAMES.map((item) => (
              <button
                key={item}
                onClick={() => selectTimeframe(item)}
                className={cn(
                  "h-8 rounded px-3 font-mono text-[10px] font-semibold text-[#6e7887]",
                  workspace.timeframe === item &&
                    "bg-[#252c36] text-white",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[58dvh] min-h-[420px] border-b border-white/[0.07]">
          <MarketChart
            bars={bars}
            family={workspace.family}
            timeframe={workspace.timeframe}
            fibs={visibleFibs}
            dataLabel={dataLabel}
            readOnly
            onUpdateFib={updateFib}
          />
        </div>

        <section className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium">Fib layers</p>
              <p className="mt-0.5 text-[9px] text-[#626c7b]">
                Visibility only. Editing and trading require desktop.
              </p>
            </div>
            <span className="font-mono text-[9px] text-[#596270]">
              {marketMeta.activeContract} / ETH
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {familyFibs.map((fib) => (
              <button
                key={fib.id}
                onClick={() => updateFib(fib.id, { visible: !fib.visible })}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#0d1015] px-3 py-3 text-left",
                  !fib.visible && "opacity-45",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      fib.direction === "buy"
                        ? "bg-[#39dca4]"
                        : "bg-[#ff5a75]",
                    )}
                  />
                  <span className="font-mono text-[10px] font-semibold">
                    {fib.timeframe.toUpperCase()} {fib.direction.toUpperCase()}
                  </span>
                </span>
                {fib.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#050609] text-[#f3f5f7]">
      <div className="hidden min-h-dvh grid-rows-[52px_minmax(0,1fr)] lg:grid">
        <header className="flex items-center border-b border-white/[0.07] bg-[#080a0e] px-3">
          <div className="flex w-[178px] items-center gap-2.5 border-r border-white/[0.07]">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#20c6c9] text-[#041011] shadow-[0_0_24px_rgba(32,198,201,0.18)]">
              <Zap size={17} strokeWidth={2.8} />
            </div>
            <span className="text-[15px] font-semibold tracking-[-0.03em]">
              VOLTIS
            </span>
            <span className="rounded border border-[#20c6c9]/20 bg-[#20c6c9]/10 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-[#56dfe1]">
              BETA
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-5 px-4">
            <button className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-xs font-medium text-[#dce1e7] hover:bg-white/[0.05]">
              <span>{workspace.family}1!</span>
              <ChevronDown size={13} className="text-[#697384]" />
            </button>
            <div className="flex items-center gap-2 font-mono text-[10px] text-[#7e8998]">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  marketLoading || marketStreamStatus === "connecting"
                    ? "animate-pulse bg-[#e0ad54]"
                    : marketStreamStatus === "reconnecting"
                      ? "animate-pulse bg-[#ff8a5b]"
                      : marketStreamStatus === "unavailable"
                        ? "bg-[#697384]"
                    : "bg-[#36d399] shadow-[0_0_8px_#36d399]",
                )}
              />
              {marketLoading || marketStreamStatus === "connecting"
                ? "CONNECTING"
                : marketStreamStatus === "live"
                  ? "LIVE CME GLOBEX"
                  : marketStreamStatus === "reconnecting"
                    ? "RECONNECTING"
                    : marketMeta.provider === "databento"
                      ? "CME HISTORICAL"
                      : "DEMO FEED"}
              <span className="text-[#38404d]">/</span>
              ETH
            </div>
            <div className="h-4 w-px bg-white/[0.07]" />
            <span className="font-mono text-[10px] text-[#697384]">
              Front month:{" "}
              <span className="text-[#a9b2bf]">
                {marketMeta.activeContract}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="mr-3 text-right">
              <span ref={clockRef} className="font-mono text-[11px] tabular-nums">
                00:00:00
              </span>
              <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#596270]">
                New York
              </div>
            </div>
            {[Bell, Settings2].map((Icon, index) => (
              <button
                key={index}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#788293] transition hover:bg-white/[0.05] hover:text-white"
              >
                <Icon size={16} />
              </button>
            ))}
            <button
              title="Sign out"
              onClick={signOut}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#788293] transition hover:bg-white/[0.05] hover:text-white"
            >
              <CircleUserRound size={16} />
            </button>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-[52px_minmax(0,1fr)_326px]">
          <aside className="flex flex-col items-center border-r border-white/[0.07] bg-[#07090d] py-3">
            <div className="flex flex-col gap-1">
              {[
                Crosshair,
                TrendingUp,
                Minus,
                Layers3,
                Grid2X2,
              ].map((Icon, index) => (
                <button
                  key={index}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-md text-[#646e7d] transition hover:bg-white/[0.05] hover:text-[#d9dfe6]",
                    index === 1 &&
                      "bg-[#20c6c9]/10 text-[#46d8da] before:absolute before:-left-1.5 before:h-5 before:w-0.5 before:rounded-full before:bg-[#2ad0d3]",
                  )}
                >
                  <Icon size={17} />
                </button>
              ))}
            </div>
            <div className="mt-auto flex flex-col gap-1">
              {[RotateCcw, Maximize2].map((Icon, index) => (
                <button
                  key={index}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[#646e7d] hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </aside>

          <div className="grid min-w-0 grid-rows-[58px_46px_minmax(0,1fr)_30px]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#080a0e] px-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#11151b] font-mono text-[10px] font-bold text-[#cfd5dc]">
                  {workspace.family}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-[13px] font-medium">
                      {FAMILY_DETAILS[workspace.family].name}
                    </h1>
                    <span className="rounded bg-[#151a21] px-1.5 py-0.5 font-mono text-[8px] text-[#6f7988]">
                      {FAMILY_DETAILS[workspace.family].exchange}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[9px] text-[#5f6978]">
                    {marketMeta.adjustment} continuous /{" "}
                    {marketMeta.provider === "databento"
                      ? marketMeta.delayed
                        ? "Databento historical"
                        : "Databento live"
                      : "deterministic simulation"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="font-mono text-lg font-medium tabular-nums tracking-[-0.04em]">
                    {lastBar ? formatPrice(lastBar.close, workspace.family) : "--"}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-[9px]",
                      sessionMove >= 0 ? "text-[#3bd9a0]" : "text-[#ff5976]",
                    )}
                  >
                    {sessionMove >= 0 ? "+" : ""}
                    {sessionMove.toFixed(2)}% session
                  </div>
                </div>
                <div className="flex rounded-md border border-white/[0.08] bg-[#0d1015] p-0.5">
                  {(["YM", "NQ"] as const).map((family) => (
                    <button
                      key={family}
                      onClick={() => selectFamily(family)}
                      className={cn(
                        "rounded px-3 py-1.5 font-mono text-[10px] font-semibold text-[#697384] transition",
                        workspace.family === family &&
                          "bg-[#252c36] text-white shadow-sm",
                      )}
                    >
                      {family}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#080a0e] px-3">
              <div className="flex items-center gap-1">
                {TIMEFRAMES.map((item) => (
                  <button
                    key={item}
                    onClick={() => selectTimeframe(item)}
                    className={cn(
                      "h-7 rounded px-2.5 font-mono text-[10px] font-semibold text-[#6e7887] transition hover:bg-white/[0.04] hover:text-[#d6dce3]",
                      workspace.timeframe === item &&
                        "bg-[#222832] text-white shadow-inner",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => addFib("buy")}
                  className="flex h-7 items-center gap-1.5 rounded border border-[#37d69d]/20 bg-[#37d69d]/10 px-2.5 text-[10px] font-semibold text-[#4ee2ac] transition hover:bg-[#37d69d]/15"
                >
                  <TrendingUp size={13} />
                  ADD BUY FIB
                </button>
                <button
                  onClick={() => addFib("sell")}
                  className="flex h-7 items-center gap-1.5 rounded border border-[#ff526f]/20 bg-[#ff526f]/10 px-2.5 text-[10px] font-semibold text-[#ff7089] transition hover:bg-[#ff526f]/15"
                >
                  <TrendingDown size={13} />
                  ADD SELL FIB
                </button>
                <button className="flex h-7 w-7 items-center justify-center rounded text-[#687282] hover:bg-white/[0.05] hover:text-white">
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>

            <MarketChart
              bars={bars}
              family={workspace.family}
              timeframe={workspace.timeframe}
              fibs={visibleFibs}
              dataLabel={
                dataLabel
              }
              onUpdateFib={updateFib}
            />

            <div className="flex items-center justify-between border-t border-white/[0.07] bg-[#080a0e] px-3 font-mono text-[9px] text-[#596270]">
              <div className="flex items-center gap-4">
                <span>ETH 17:00-16:00 CT</span>
                <span>Deviation 20 / Depth 50</span>
                <span>
                  {bars.length} bars / {marketMeta.sourceSchema}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span>UTC-4</span>
                <span className="text-[#778291]">B-ADJ</span>
              </div>
            </div>
          </div>

          <aside className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] border-l border-white/[0.07] bg-[#090b0f]">
            <div className="flex items-center border-b border-white/[0.07] px-2">
              {(["fibs", "trade"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPanelMode(mode)}
                  className={cn(
                    "relative h-full flex-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5e6877]",
                    panelMode === mode &&
                      "text-[#e5e9ed] after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-[#2cd0d3]",
                  )}
                >
                  {mode === "fibs" ? `Fib layers (${familyFibs.length})` : "Trade"}
                </button>
              ))}
              <button className="flex h-8 w-8 items-center justify-center rounded text-[#5e6877] hover:bg-white/[0.05] hover:text-white">
                <PanelRightClose size={15} />
              </button>
            </div>

            {panelMode === "fibs" ? (
              <div className="min-h-0 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-3">
                  <div>
                    <p className="text-[11px] font-medium">Visible overlays</p>
                    <p className="mt-0.5 text-[9px] text-[#626c7b]">
                      Drag active anchors to lock them.
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        setWorkspace((current) => ({
                          ...current,
                          fibs: current.fibs.map((fib) =>
                            fib.family === current.family
                              ? { ...fib, visible: true }
                              : fib,
                          ),
                        }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded text-[#697384] hover:bg-white/[0.05] hover:text-white"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setWorkspace((current) => ({
                          ...current,
                          fibs: current.fibs.map((fib) =>
                            fib.family === current.family
                              ? { ...fib, visible: false }
                              : fib,
                          ),
                        }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded text-[#697384] hover:bg-white/[0.05] hover:text-white"
                    >
                      <EyeOff size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 p-2">
                  {familyFibs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/[0.09] px-4 py-10 text-center">
                      <Layers3 className="mx-auto text-[#46505e]" size={22} />
                      <p className="mt-3 text-[11px] text-[#a3acb8]">
                        No fib layers yet
                      </p>
                      <p className="mt-1 text-[9px] leading-4 text-[#596270]">
                        Choose a timeframe, then add a buy or sell fib.
                      </p>
                    </div>
                  ) : null}

                  {familyFibs.map((fib) => {
                    const zero = fibPrice(fib, 0);
                    const one = fibPrice(fib, 1);
                    const isBuy = fib.direction === "buy";
                    return (
                      <div
                        key={fib.id}
                        className={cn(
                          "group rounded-lg border border-white/[0.06] bg-[#0d1015] px-2.5 py-2.5 transition hover:border-white/[0.1]",
                          fib.timeframe === workspace.timeframe &&
                            "border-[#2ccdd0]/20 bg-[#0e1318]",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              updateFib(fib.id, { visible: !fib.visible })
                            }
                            className="text-[#687282] hover:text-white"
                          >
                            {fib.visible ? (
                              <Eye size={13} />
                            ) : (
                              <EyeOff size={13} />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              selectTimeframe(fib.timeframe)
                            }
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isBuy
                                  ? "bg-[#39dca4] shadow-[0_0_6px_#39dca4]"
                                  : "bg-[#ff5a75] shadow-[0_0_6px_#ff5a75]",
                              )}
                              style={{ opacity: FIB_OPACITY[fib.timeframe] / 100 }}
                            />
                            <span className="font-mono text-[10px] font-semibold text-[#d8dde3]">
                              {fib.timeframe.toUpperCase()}
                            </span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-mono text-[8px] font-semibold",
                                isBuy
                                  ? "bg-[#31d99e]/10 text-[#4be0ae]"
                                  : "bg-[#ff526f]/10 text-[#ff7089]",
                              )}
                            >
                              {fib.direction.toUpperCase()}
                            </span>
                            {fib.manual ? (
                              <span className="font-mono text-[7px] uppercase text-[#687282]">
                                manual
                              </span>
                            ) : null}
                          </button>
                          <button
                            onClick={() =>
                              updateFib(fib.id, { locked: !fib.locked })
                            }
                            className="text-[#5e6877] opacity-0 transition hover:text-white group-hover:opacity-100"
                          >
                            {fib.locked ? (
                              <Lock size={12} />
                            ) : (
                              <Unlock size={12} />
                            )}
                          </button>
                          <button
                            onClick={() => refreshFib(fib)}
                            className="text-[#5e6877] opacity-0 transition hover:text-white group-hover:opacity-100"
                          >
                            <RefreshCw size={12} />
                          </button>
                          <button
                            onClick={() =>
                              setWorkspace((current) => ({
                                ...current,
                                fibs: current.fibs.filter(
                                  (item) => item.id !== fib.id,
                                ),
                              }))
                            }
                            className="text-[#5e6877] opacity-0 transition hover:text-[#ff7089] group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between pl-5 font-mono text-[8px] text-[#5d6775]">
                          <span>1 {formatPrice(one, workspace.family)}</span>
                          <ChevronRight size={10} />
                          <span>0 {formatPrice(zero, workspace.family)}</span>
                          <span>{FIB_OPACITY[fib.timeframe]}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="min-h-0 overflow-y-auto p-3">
                <div className="rounded-lg border border-[#d9a441]/15 bg-[#d9a441]/[0.06] p-3">
                  <div className="flex items-center gap-2 text-[#e1b55d]">
                    <ShieldCheck size={14} />
                    <span className="text-[10px] font-semibold">
                      PAPER EXECUTION
                    </span>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-4 text-[#8a806d]">
                    TradersPost is not connected. Intents are validated
                    server-side and never leave Voltis.
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-[#dbe0e6]">
                      Execution contract
                    </p>
                    <p className="mt-0.5 font-mono text-[8px] text-[#5e6877]">
                      Analysis remains on {workspace.family}
                    </p>
                  </div>
                  <div className="flex rounded-md border border-white/[0.08] bg-[#07090d] p-0.5">
                    {(["mini", "micro"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => patchWorkspace({ executionSize: size })}
                        className={cn(
                          "rounded px-2.5 py-1.5 font-mono text-[9px] uppercase text-[#626c7b]",
                          workspace.executionSize === size &&
                            "bg-[#252c36] text-white",
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-white/[0.07] bg-[#0d1015]">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
                    <span className="font-mono text-xl font-semibold tracking-[-0.05em]">
                      {ticker}
                    </span>
                    <span className="font-mono text-[10px] text-[#7d8795]">
                      {lastBar
                        ? formatPrice(lastBar.close, workspace.family)
                        : "--"}
                    </span>
                  </div>

                  <div className="space-y-3 p-3">
                    <NumberControl
                      label="Quantity"
                      value={workspace.quantity}
                      min={1}
                      step={1}
                      onChange={(quantity) => patchWorkspace({ quantity })}
                    />
                    <NumberControl
                      label="Stop loss"
                      suffix="pts"
                      value={workspace.stopLoss}
                      min={0}
                      step={5}
                      onChange={(stopLoss) => patchWorkspace({ stopLoss })}
                    />
                    <NumberControl
                      label="Take profit"
                      suffix="pts"
                      value={workspace.takeProfit}
                      min={0}
                      step={5}
                      onChange={(takeProfit) =>
                        patchWorkspace({ takeProfit })
                      }
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#596270]">
                    Selected accounts
                  </p>
                  <div className="space-y-1.5">
                    {["Apex 50K", "Take Profit 50K"].map((account) => (
                      <label
                        key={account}
                        className="flex cursor-pointer items-center justify-between rounded-md border border-white/[0.06] bg-[#0d1015] px-3 py-2.5"
                      >
                        <span className="text-[10px] text-[#aeb6c1]">
                          {account}
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedAccounts.includes(account)}
                          onChange={() =>
                            setSelectedAccounts((current) =>
                              current.includes(account)
                                ? current.filter((item) => item !== account)
                                : [...current, account],
                            )
                          }
                          className="accent-[#26c9cc]"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() =>
                    setArmed((current) => !current)
                  }
                  className={cn(
                    "mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition",
                    armed
                      ? "border-[#ffb34d]/30 bg-[#ffb34d]/10 text-[#ffc36f]"
                      : "border-white/[0.08] bg-[#11151b] text-[#7a8492] hover:text-white",
                  )}
                >
                  {armed ? <Unlock size={14} /> : <Lock size={14} />}
                  {armed ? "Trading armed - 60s" : "Arm paper trading"}
                </button>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    disabled={!armed || submitting || selectedAccounts.length === 0}
                    onClick={() => submitPaperOrder("sell")}
                    className="h-12 rounded-md bg-[#d83d59] text-[11px] font-semibold text-white transition hover:bg-[#e14765] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    SELL MARKET
                  </button>
                  <button
                    disabled={!armed || submitting || selectedAccounts.length === 0}
                    onClick={() => submitPaperOrder("buy")}
                    className="h-12 rounded-md bg-[#13a97b] text-[11px] font-semibold text-white transition hover:bg-[#18b887] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    BUY MARKET
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    disabled
                    className="h-8 rounded border border-white/[0.07] bg-[#0d1015] font-mono text-[8px] text-[#596270]"
                  >
                    CANCEL ALL
                  </button>
                  <button
                    disabled
                    className="h-8 rounded border border-white/[0.07] bg-[#0d1015] font-mono text-[8px] text-[#596270]"
                  >
                    FLATTEN
                  </button>
                </div>

                {paperMessage ? (
                  <div className="mt-3 rounded-md border border-[#31d99e]/15 bg-[#31d99e]/[0.06] px-3 py-2.5 text-[9px] leading-4 text-[#75d9b5]">
                    {paperMessage}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function NumberControl({
  label,
  value,
  min,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[#7c8694]">{label}</span>
      <div className="flex items-center overflow-hidden rounded border border-white/[0.08] bg-[#07090d]">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-7 w-7 items-center justify-center text-[#687282] hover:bg-white/[0.05] hover:text-white"
        >
          -
        </button>
        <span className="min-w-12 px-1 text-center font-mono text-[9px] tabular-nums text-[#d7dce2]">
          {value}
          {suffix ? <span className="ml-1 text-[#596270]">{suffix}</span> : null}
        </span>
        <button
          onClick={() => onChange(value + step)}
          className="flex h-7 w-7 items-center justify-center text-[#687282] hover:bg-white/[0.05] hover:text-white"
        >
          +
        </button>
      </div>
    </div>
  );
}
