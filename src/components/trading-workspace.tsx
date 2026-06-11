"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  Grid2X2,
  Inbox,
  Layers3,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  Unlock,
  X,
  ZoomIn,
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
import { BrandMark } from "@/components/brand-mark";
import { MarketChart } from "@/components/market-chart";

const provider = new ApiExecutionProvider();
type WorkspaceTheme = "light" | "dark";
type WorkspacePanel = "positions" | "journal" | "analytics";
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
  const [armed, setArmed] = useState(false);
  const [paperMessage, setPaperMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [panelMode, setPanelMode] = useState<"fibs" | "trade">("fibs");
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const [activePanel, setActivePanel] = useState<WorkspacePanel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState([
    "Apex 50K",
    "Take Profit 50K",
  ]);
  const workspaceRootRef = useRef<HTMLElement>(null);
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
    const savedTheme = window.localStorage.getItem("voltis-theme");
    if (savedTheme === "dark") {
      queueMicrotask(() => setTheme("dark"));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voltis-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (activePanel) {
        setActivePanel(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activePanel]);

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
    window.location.assign("/");
  }

  function toggleFullscreen() {
    setIsFullscreen((current) => !current);
  }

  const dataLabel =
    marketMeta.provider === "databento"
      ? `DATABENTO ${marketMeta.delayed ? "HISTORICAL" : "LIVE"}`
      : marketStreamStatus === "unavailable"
        ? "DETERMINISTIC DEMO FEED"
        : "CONNECTING LIVE DATA";

  return (
    <main
      ref={workspaceRootRef}
      data-theme={theme}
      data-fullscreen={isFullscreen ? "true" : "false"}
      className="voltis-workspace relative h-dvh min-w-[1180px] overflow-hidden bg-[#eae9e7] p-6 text-[#171717]"
    >
      <div className="voltis-frame mx-auto grid h-full max-w-[1536px] grid-rows-[74px_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/80 bg-[#f8f8f6] shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
        <header className="flex items-center border-b border-[#e3e3df] px-7">
          <div className="flex w-[250px] items-center gap-3">
            <BrandMark inverse={theme === "dark"} />
            <span className="text-[20px] font-semibold tracking-[-0.04em]">
              Voltis
            </span>
          </div>

          <nav className="flex items-center gap-2">
            {[BarChart3, Inbox, Folder, BookOpen, Grid2X2].map(
              (Icon, index) => (
                <button
                  key={Icon.displayName ?? index}
                  aria-label={`Workspace navigation ${index + 1}`}
                  onClick={() => {
                    if (index === 0) setActivePanel(null);
                    if (index === 1) setActivePanel("positions");
                    if (index === 2 || index === 3) setActivePanel("journal");
                    if (index === 4) setActivePanel("analytics");
                  }}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg border border-[#eeeeeb] bg-white text-[#222] shadow-sm transition hover:bg-[#f2f2ef]",
                    (index === 0 ? activePanel === null : false) &&
                      "border-black bg-black text-white hover:bg-black",
                    (index === 1 && activePanel === "positions") ||
                      ((index === 2 || index === 3) &&
                        activePanel === "journal") ||
                      (index === 4 && activePanel === "analytics")
                      ? "border-black bg-black text-white hover:bg-black"
                      : null,
                  )}
                >
                  <Icon size={16} />
                </button>
              ),
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-11 w-[250px] items-center gap-3 rounded-lg border border-[#eeeeeb] bg-white px-4 text-[#999] shadow-sm">
              <Search size={17} className="text-black" />
              <span className="text-[11px]">Search Dashboard</span>
            </div>
            <button
              onClick={toggleFullscreen}
              data-testid="fullscreen-toggle"
              className="flex h-11 items-center gap-2 rounded-lg border border-[#eeeeeb] bg-white px-3 text-[9px] font-medium shadow-sm transition hover:bg-[#f2f2ef]"
            >
              {isFullscreen ? (
                <Minimize2 size={14} />
              ) : (
                <Maximize2 size={14} />
              )}
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
            <button
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={() =>
                setTheme((current) =>
                  current === "light" ? "dark" : "light",
                )
              }
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#eeeeeb] bg-white shadow-sm transition hover:bg-[#f2f2ef]"
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              aria-label="Notifications"
              className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-[#eeeeeb] bg-white shadow-sm"
            >
              <Bell size={16} />
              <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#d9414e]" />
            </button>
            <button
              onClick={signOut}
              className="flex h-11 items-center gap-2 rounded-lg border border-[#eeeeeb] bg-white px-3 shadow-sm"
              title="Sign out"
            >
              <CircleUserRound size={22} />
              <span className="text-left">
                <span className="block text-[10px] font-medium">Yazan</span>
                <span className="flex items-center gap-1 text-[8px] text-[#858585]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#48bd78]" />
                  Online
                </span>
              </span>
              <ChevronDown size={14} className="ml-2" />
            </button>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid min-w-0 grid-rows-[88px_54px_minmax(0,1fr)_82px] gap-0 px-7 pb-6 max-[1350px]:grid-rows-[78px_96px_minmax(0,1fr)_82px]">
            <div className="flex items-end justify-between pb-5">
              <div>
                <h1 className="text-[29px] font-medium tracking-[-0.04em]">
                  Overview
                </h1>
                <p className="mt-1 text-[9px] text-[#8a8a86]">
                  Voltis workspace &nbsp;/&nbsp; {workspace.family} Trading
                </p>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="font-mono text-[20px] font-medium tabular-nums">
                    {lastBar ? formatPrice(lastBar.close, workspace.family) : "--"}
                  </p>
                  <p
                    className={cn(
                      "font-mono text-[9px]",
                      sessionMove >= 0 ? "text-[#36a968]" : "text-[#c64b55]",
                    )}
                  >
                    {sessionMove >= 0 ? "+" : ""}
                    {sessionMove.toFixed(2)}% session
                  </p>
                </div>
                <div className="h-9 w-px bg-[#e1e1dd]" />
                <div className="text-left text-[9px] text-[#777]">
                  <p>{marketMeta.activeContract} · ETH</p>
                  <p className="mt-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        marketLoading || marketStreamStatus === "connecting"
                          ? "animate-pulse bg-[#d7a33f]"
                          : marketStreamStatus === "live"
                            ? "bg-[#47bd78]"
                            : "bg-[#a4a4a0]",
                      )}
                    />
                    {dataLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between max-[1350px]:flex-col max-[1350px]:items-start max-[1350px]:justify-center max-[1350px]:gap-1.5">
              <div className="flex items-center gap-1">
                {[
                  ["Chart", null],
                  ["Positions", "positions"],
                  ["Journal", "journal"],
                  ["Analytics", "analytics"],
                ].map(([label, panel]) => (
                    <button
                      key={label}
                      onClick={() =>
                        setActivePanel(panel as WorkspacePanel | null)
                      }
                      className={cn(
                        "h-10 rounded-lg border border-[#e5e5e1] bg-transparent px-3 text-[10px] transition hover:bg-white",
                        activePanel === panel &&
                          "border-black bg-black text-white hover:bg-black",
                      )}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-[#e5e5e1] bg-white p-1">
                  {(["YM", "NQ"] as const).map((family) => (
                    <button
                      key={family}
                      onClick={() => selectFamily(family)}
                      className={cn(
                        "h-8 rounded-md px-4 text-[10px] font-medium",
                        workspace.family === family && "bg-black text-white",
                      )}
                    >
                      {family}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg border border-[#e5e5e1] bg-white p-1">
                  {TIMEFRAMES.map((item) => (
                    <button
                      key={item}
                      onClick={() => selectTimeframe(item)}
                      className={cn(
                        "h-8 rounded-md px-2 font-mono text-[9px] text-[#666]",
                        workspace.timeframe === item && "bg-black text-white",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => addFib("buy")}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-[#dce9e0] bg-[#edf7f0] px-3 text-[9px] font-medium text-[#247f4b]"
                >
                  <TrendingUp size={13} />
                  Buy fib
                </button>
                <button
                  onClick={() => addFib("sell")}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-[#eadfe0] bg-[#f8eeee] px-3 text-[9px] font-medium text-[#9f3e47]"
                >
                  <TrendingDown size={13} />
                  Sell fib
                </button>
              </div>
            </div>

            <div className="grid min-h-0 grid-cols-[52px_minmax(0,1fr)] grid-rows-[44px_minmax(0,1fr)] overflow-hidden rounded-xl border border-[#dfdfda] bg-[#fbfbfa]">
              <aside className="row-span-2 flex flex-col items-center border-r border-[#e5e5e1] py-3">
                <div className="flex flex-col gap-1">
                  {[
                    Crosshair,
                    TrendingUp,
                    SlidersHorizontal,
                    Layers3,
                    Smile,
                    Ruler,
                    ZoomIn,
                  ].map((Icon, index) => (
                    <button
                      key={Icon.displayName ?? index}
                      aria-label={`Chart tool ${index + 1}`}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md text-[#272727] transition hover:bg-[#efefec]",
                        index === 0 && "text-[#4b8ee8]",
                      )}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
                <div className="mt-auto flex flex-col gap-1">
                  <button
                    aria-label="Reset chart view"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-[#444] hover:bg-[#efefec]"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    onClick={toggleFullscreen}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-[#444] hover:bg-[#efefec]"
                  >
                    {isFullscreen ? (
                      <Minimize2 size={16} />
                    ) : (
                      <Maximize2 size={16} />
                    )}
                  </button>
                </div>
              </aside>

              <div className="flex items-center gap-3 border-b border-[#e8e8e4] px-4">
                <span className="font-mono text-[11px] font-semibold">
                  {workspace.family}1! · {workspace.timeframe} ·{" "}
                  {FAMILY_DETAILS[workspace.family].exchange}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#47bd78]" />
                <span className="font-mono text-[9px] text-[#888]">
                  {FAMILY_DETAILS[workspace.family].name}
                </span>
                <span className="ml-auto font-mono text-[8px] text-[#999]">
                  ETH 17:00-16:00 CT · Deviation 20 / Depth 50 · B-ADJ
                </span>
              </div>

              <MarketChart
                bars={bars}
                family={workspace.family}
                timeframe={workspace.timeframe}
                fibs={visibleFibs}
                dataLabel={dataLabel}
                theme={theme}
                onUpdateFib={updateFib}
              />
            </div>

            <div className="grid grid-cols-4 gap-3 pt-3">
              {[
                ["Current Price", lastBar ? formatPrice(lastBar.close, workspace.family) : "--"],
                ["Session Move", `${sessionMove >= 0 ? "+" : ""}${sessionMove.toFixed(2)}%`],
                ["Visible Fibs", String(visibleFibs.length)],
                ["Data Source", marketMeta.provider === "databento" ? "Databento" : "Demo"],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-[#e2e2de] bg-white px-4"
                >
                  <div>
                    <p className="text-[8px] text-[#777]">{label}</p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-[14px] font-medium",
                        index === 1 && sessionMove >= 0 && "text-[#47ad70]",
                      )}
                    >
                      {value}
                    </p>
                  </div>
                  <svg width="76" height="28" viewBox="0 0 76 28" fill="none">
                    <path
                      d="M2 24L10 20L17 22L25 13L33 18L41 8L49 12L57 4L65 9L74 2"
                      stroke={index === 3 ? "#222" : "#55bb7d"}
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          <aside className="grid min-h-0 grid-rows-[58px_50px_minmax(0,1fr)] border-l border-[#dfdfda] bg-[#fafaf8]">
            <div className="flex items-center justify-between border-b border-[#e3e3df] px-4">
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <TrendingUp size={15} />
                Trading Panel
              </div>
              <PanelRightClose size={15} className="text-[#999]" />
            </div>

            <div className="grid grid-cols-2 gap-1 border-b border-[#e3e3df] p-2">
              {(["fibs", "trade"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPanelMode(mode)}
                  className={cn(
                    "h-8 rounded-md text-[10px] text-[#555]",
                    panelMode === mode && "border border-[#e2e2de] bg-white text-black shadow-sm",
                  )}
                >
                  {mode === "fibs" ? `Fib Layers (${familyFibs.length})` : "Trade"}
                </button>
              ))}
            </div>

            {panelMode === "fibs" ? (
              <div className="min-h-0 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-[#e5e5e1] px-4 py-4">
                  <div>
                    <p className="text-[11px] font-medium">Visible overlays</p>
                    <p className="mt-1 text-[9px] text-[#888]">
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
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#e3e3df] bg-white text-[#555]"
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
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#e3e3df] bg-white text-[#555]"
                    >
                      <EyeOff size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 p-3">
                  {familyFibs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#d8d8d4] bg-white px-4 py-10 text-center">
                      <Layers3 className="mx-auto text-[#888]" size={22} />
                      <p className="mt-3 text-[11px] text-[#444]">
                        No fib layers yet
                      </p>
                      <p className="mt-1 text-[9px] leading-4 text-[#888]">
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
                          "group rounded-lg border border-[#e2e2de] bg-white px-3 py-3 transition hover:border-[#c9c9c4]",
                          fib.timeframe === workspace.timeframe &&
                            "border-[#b8b8b2] shadow-sm",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              updateFib(fib.id, { visible: !fib.visible })
                            }
                            className="text-[#73777c] hover:text-black"
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
                                  ? "bg-[#47bd78]"
                                  : "bg-[#c95b64]",
                              )}
                              style={{ opacity: FIB_OPACITY[fib.timeframe] / 100 }}
                            />
                            <span className="font-mono text-[10px] font-semibold text-[#222]">
                              {fib.timeframe.toUpperCase()}
                            </span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-mono text-[8px] font-semibold",
                                isBuy
                                  ? "bg-[#e9f6ed] text-[#28824e]"
                                  : "bg-[#f7eaea] text-[#9a4149]",
                              )}
                            >
                              {fib.direction.toUpperCase()}
                            </span>
                            {fib.manual ? (
                              <span className="font-mono text-[7px] uppercase text-[#999]">
                                manual
                              </span>
                            ) : null}
                          </button>
                          <button
                            onClick={() =>
                              updateFib(fib.id, { locked: !fib.locked })
                            }
                            className="text-[#777] opacity-0 transition hover:text-black group-hover:opacity-100"
                          >
                            {fib.locked ? (
                              <Lock size={12} />
                            ) : (
                              <Unlock size={12} />
                            )}
                          </button>
                          <button
                            onClick={() => refreshFib(fib)}
                            className="text-[#777] opacity-0 transition hover:text-black group-hover:opacity-100"
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
                            className="text-[#777] opacity-0 transition hover:text-[#b9444d] group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between pl-5 font-mono text-[8px] text-[#888]">
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
              <div className="min-h-0 overflow-y-auto p-4">
                <div className="rounded-lg border border-[#e3e3df] bg-white p-3">
                  <div className="flex items-center gap-2 text-[#333]">
                    <ShieldCheck size={14} />
                    <span className="text-[10px] font-semibold">
                      PAPER EXECUTION
                    </span>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-4 text-[#888]">
                    TradersPost is not connected. Intents are validated
                    server-side and never leave Voltis.
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-[#222]">
                      Execution contract
                    </p>
                    <p className="mt-0.5 font-mono text-[8px] text-[#888]">
                      Analysis remains on {workspace.family}
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-[#e2e2de] bg-white p-1">
                    {(["mini", "micro"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => patchWorkspace({ executionSize: size })}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 font-mono text-[9px] uppercase text-[#666]",
                          workspace.executionSize === size &&
                            "bg-black text-white",
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-[#e2e2de] bg-white">
                  <div className="flex items-center justify-between border-b border-[#e8e8e4] px-3 py-3">
                    <span className="font-mono text-xl font-semibold tracking-[-0.05em]">
                      {ticker}
                    </span>
                    <span className="font-mono text-[10px] text-[#777]">
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
                  <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#777]">
                    Selected accounts
                  </p>
                  <div className="space-y-1.5">
                    {["Apex 50K", "Take Profit 50K"].map((account) => (
                      <label
                        key={account}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-[#e2e2de] bg-white px-3 py-2.5"
                      >
                        <span className="text-[10px] text-[#444]">
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
                          className="accent-[#47bd78]"
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
                    "mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition",
                    armed
                      ? "border-black bg-black text-white"
                      : "border-[#dcdcd8] bg-white text-[#555] hover:border-black",
                  )}
                >
                  {armed ? <Unlock size={14} /> : <Lock size={14} />}
                  {armed ? "Trading armed - 60s" : "Arm paper trading"}
                </button>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    disabled={!armed || submitting || selectedAccounts.length === 0}
                    onClick={() => submitPaperOrder("sell")}
                    className="h-16 rounded-lg border border-[#e2e2de] bg-[#f2f2ef] text-[11px] font-semibold text-[#777] transition hover:bg-[#e9e9e5] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    SELL MARKET
                  </button>
                  <button
                    disabled={!armed || submitting || selectedAccounts.length === 0}
                    onClick={() => submitPaperOrder("buy")}
                    className="h-16 rounded-lg bg-[#47bd78] text-[11px] font-semibold text-white transition hover:bg-[#3cad6c] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    BUY MARKET
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    disabled
                    className="h-8 rounded-lg border border-[#e2e2de] bg-white font-mono text-[8px] text-[#999]"
                  >
                    CANCEL ALL
                  </button>
                  <button
                    disabled
                    className="h-8 rounded-lg border border-[#e2e2de] bg-white font-mono text-[8px] text-[#999]"
                  >
                    FLATTEN
                  </button>
                </div>

                {paperMessage ? (
                  <div className="mt-3 rounded-lg border border-[#d5eadc] bg-[#eef8f1] px-3 py-2.5 text-[9px] leading-4 text-[#277b49]">
                    {paperMessage}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </section>
      </div>
      {activePanel ? (
        <WorkspaceDrawer
          panel={activePanel}
          family={workspace.family}
          currentPrice={
            lastBar ? formatPrice(lastBar.close, workspace.family) : "--"
          }
          sessionMove={sessionMove}
          onClose={() => setActivePanel(null)}
        />
      ) : null}
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
      <span className="text-[10px] text-[#555]">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-[#e2e2de] bg-[#fafaf8]">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-8 w-8 items-center justify-center text-[#555] hover:bg-[#ecece8]"
        >
          -
        </button>
        <span className="min-w-14 px-1 text-center font-mono text-[9px] tabular-nums text-[#222]">
          {value}
          {suffix ? <span className="ml-1 text-[#888]">{suffix}</span> : null}
        </span>
        <button
          onClick={() => onChange(value + step)}
          className="flex h-8 w-8 items-center justify-center text-[#555] hover:bg-[#ecece8]"
        >
          +
        </button>
      </div>
    </div>
  );
}

function WorkspaceDrawer({
  panel,
  family,
  currentPrice,
  sessionMove,
  onClose,
}: {
  panel: WorkspacePanel;
  family: SymbolFamily;
  currentPrice: string;
  sessionMove: number;
  onClose: () => void;
}) {
  const titles: Record<WorkspacePanel, { eyebrow: string; title: string }> = {
    positions: {
      eyebrow: "Live portfolio",
      title: "Positions",
    },
    journal: {
      eyebrow: "Review and refine",
      title: "Journal",
    },
    analytics: {
      eyebrow: "Performance intelligence",
      title: "Analytics",
    },
  };

  return (
    <div
      className="absolute inset-0 z-50 flex justify-end bg-black/25 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={titles[panel].title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="voltis-drawer flex h-full w-[min(760px,72vw)] flex-col overflow-hidden rounded-2xl border border-white/70 bg-[#f8f8f6] shadow-[0_30px_90px_rgba(0,0,0,0.28)]">
        <header className="flex items-center border-b border-[#e2e2de] px-8 py-6">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#858782]">
              {titles[panel].eyebrow}
            </p>
            <h2 className="mt-2 text-[28px] font-medium tracking-[-0.05em]">
              {titles[panel].title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={`Close ${titles[panel].title}`}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#e2e2de] bg-white transition hover:bg-[#efefec]"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          {panel === "positions" ? (
            <PositionsPanel family={family} currentPrice={currentPrice} />
          ) : null}
          {panel === "journal" ? <JournalPanel /> : null}
          {panel === "analytics" ? (
            <AnalyticsPanel sessionMove={sessionMove} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PositionsPanel({
  family,
  currentPrice,
}: {
  family: SymbolFamily;
  currentPrice: string;
}) {
  const positions = [
    {
      account: "Apex 50K",
      symbol: family === "YM" ? "MYM" : "MNQ",
      side: "LONG",
      quantity: 2,
      entry: family === "YM" ? "50,512" : "19,842.50",
      pnl: "+$152.00",
    },
    {
      account: "Take Profit 50K",
      symbol: family,
      side: "LONG",
      quantity: 1,
      entry: family === "YM" ? "50,536" : "19,856.25",
      pnl: "+$104.00",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Open P&L", "+$256.00"],
          ["Daily realized", "+$684.50"],
          ["Buying power", "$96,420"],
        ].map(([label, value], index) => (
          <div
            key={label}
            className="rounded-xl border border-[#e2e2de] bg-white p-5"
          >
            <p className="text-[9px] text-[#858782]">{label}</p>
            <p
              className={cn(
                "mt-3 font-mono text-lg font-medium",
                index < 2 && "text-[#349961]",
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[#e2e2de] bg-white">
        <div className="grid grid-cols-[1.5fr_.8fr_.7fr_.7fr_1fr_1fr_1fr] border-b border-[#e8e8e4] px-5 py-3 font-mono text-[8px] uppercase tracking-[0.1em] text-[#8a8c87]">
          <span>Account</span>
          <span>Symbol</span>
          <span>Side</span>
          <span>Qty</span>
          <span>Entry</span>
          <span>Mark</span>
          <span className="text-right">Open P&L</span>
        </div>
        {positions.map((position) => (
          <div
            key={position.account}
            className="grid grid-cols-[1.5fr_.8fr_.7fr_.7fr_1fr_1fr_1fr] items-center border-b border-[#eeeeeb] px-5 py-5 text-[10px] last:border-b-0"
          >
            <span className="font-medium">{position.account}</span>
            <span className="font-mono">{position.symbol}</span>
            <span className="font-mono text-[8px] text-[#349961]">
              {position.side}
            </span>
            <span className="font-mono">{position.quantity}</span>
            <span className="font-mono">{position.entry}</span>
            <span className="font-mono">{currentPrice}</span>
            <span className="text-right font-mono text-[#349961]">
              {position.pnl}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-[#d8eadf] bg-[#edf7f0] px-5 py-4">
        <div>
          <p className="text-[10px] font-medium text-[#26794a]">
            Risk is within plan
          </p>
          <p className="mt-1 text-[9px] text-[#5e8a70]">
            0.42% of combined account equity is currently at risk.
          </p>
        </div>
        <ShieldCheck size={19} className="text-[#349961]" />
      </div>
    </div>
  );
}

function JournalPanel() {
  const entries = [
    {
      date: "JUN 10",
      setup: "4H rejection into 30m continuation",
      symbol: "MYM",
      result: "+$428",
      note: "Waited for the second close below the sell fib before entry.",
    },
    {
      date: "JUN 09",
      setup: "1D buy fib reclaim",
      symbol: "MNQ",
      result: "+$312",
      note: "Clean reclaim. Reduced size after the first target was paid.",
    },
    {
      date: "JUN 08",
      setup: "Opening drive fade",
      symbol: "MYM",
      result: "-$116",
      note: "Entry was early. Require a confirmed structure break next time.",
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        {entries.map((entry) => (
          <article
            key={`${entry.date}-${entry.setup}`}
            className="rounded-xl border border-[#e2e2de] bg-white p-5"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-[8px] text-[#858782]">
                {entry.date}
              </span>
              <span className="rounded bg-[#f0f0ed] px-2 py-1 font-mono text-[8px]">
                {entry.symbol}
              </span>
              <span
                className={cn(
                  "ml-auto font-mono text-[10px] font-medium",
                  entry.result.startsWith("+")
                    ? "text-[#349961]"
                    : "text-[#b74952]",
                )}
              >
                {entry.result}
              </span>
            </div>
            <h3 className="mt-4 text-[13px] font-medium">{entry.setup}</h3>
            <p className="mt-2 text-[10px] leading-5 text-[#72746f]">
              {entry.note}
            </p>
          </article>
        ))}
      </div>

      <aside className="rounded-xl border border-[#e2e2de] bg-white p-5">
        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#858782]">
          New note
        </p>
        <textarea
          aria-label="New journal note"
          placeholder="What did the market show you?"
          className="mt-4 h-40 w-full resize-none rounded-lg border border-[#e2e2de] bg-[#fafaf8] p-3 text-[10px] leading-5 outline-none placeholder:text-[#aaa] focus:border-[#999]"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="h-10 rounded-lg border border-[#e2e2de] bg-[#fafaf8] text-[9px]">
            Add chart
          </button>
          <button className="h-10 rounded-lg bg-black text-[9px] font-medium text-white">
            Save note
          </button>
        </div>
      </aside>
    </div>
  );
}

function AnalyticsPanel({ sessionMove }: { sessionMove: number }) {
  const bars = [48, 64, 42, 78, 56, 88, 74, 96, 68, 84, 92, 76];

  return (
    <div>
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Net P&L", "+$4,286"],
          ["Win rate", "68.4%"],
          ["Profit factor", "2.41"],
          ["Avg. R multiple", "1.84R"],
        ].map(([label, value], index) => (
          <div
            key={label}
            className="rounded-xl border border-[#e2e2de] bg-white p-5"
          >
            <p className="text-[9px] text-[#858782]">{label}</p>
            <p
              className={cn(
                "mt-3 font-mono text-lg font-medium",
                index === 0 && "text-[#349961]",
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[#e2e2de] bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium">Cumulative performance</p>
            <p className="mt-1 text-[9px] text-[#858782]">
              Last 30 trading sessions
            </p>
          </div>
          <span
            className={cn(
              "rounded-lg px-3 py-2 font-mono text-[9px]",
              sessionMove >= 0
                ? "bg-[#edf7f0] text-[#297d4c]"
                : "bg-[#f8eeee] text-[#9f3e47]",
            )}
          >
            TODAY {sessionMove >= 0 ? "+" : ""}
            {sessionMove.toFixed(2)}%
          </span>
        </div>

        <div className="mt-8 flex h-64 items-end gap-3 border-b border-[#dededa] px-2">
          {bars.map((height, index) => (
            <div
              key={`${height}-${index}`}
              className="group relative flex h-full flex-1 items-end"
            >
              <div
                className={cn(
                  "w-full rounded-t-md transition group-hover:opacity-75",
                  index === 3 || index === 8
                    ? "bg-[#c86a72]"
                    : "bg-[#4bb879]",
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between font-mono text-[8px] text-[#969893]">
          <span>MAY 01</span>
          <span>MAY 15</span>
          <span>JUN 01</span>
          <span>JUN 11</span>
        </div>
      </div>
    </div>
  );
}
