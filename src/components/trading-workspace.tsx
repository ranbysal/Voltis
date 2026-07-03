"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import {
  ArrowLeft,
  Bell,
  Crosshair,
  Eye,
  EyeOff,
  Layers3,
  LogOut,
  Magnet,
  Maximize2,
  Minimize2,
  Moon,
  Ruler,
  Settings,
  Sun,
  Trash2,
  TrendingUp,
  Type,
  User,
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
  FAMILY_LABELS,
  TIMEFRAMES,
  executionTicker,
  type ChartDrawing,
  type FibAnchor,
  type FibDirection,
  type FibDrawing,
  type MarketBar,
  type SymbolFamily,
  type Timeframe,
  type WorkspaceState,
} from "@/lib/domain";
import { ApiExecutionProvider } from "@/lib/execution";
import { barCountFor, type MarketDataMeta } from "@/lib/market-data";
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
import {
  BOOT_FLAG,
  BOOT_TIME_SCALE,
  ms,
  type BootPhase,
} from "@/components/transition/boot-config";
import { BootProvider, useBoot, useBootPhase } from "@/components/transition/boot-context";
import { BootFrame } from "@/components/transition/boot-frame";
import { useCountUp } from "@/components/transition/use-count-up";
import {
  computeEma,
  MarketChart,
  type ChartStyle,
  type ChartTool,
} from "@/components/market-chart";
import { FibLayersPanel } from "@/components/workspace/fib-layers";
import {
  AnalyticsPopup,
  JournalPopup,
  PositionsPopup,
} from "@/components/workspace/popups";
import { TickerStrip } from "@/components/workspace/ticker-strip";
import { TradingPanel } from "@/components/workspace/trading-panel";
import { Dropdown, MenuItem, Sparkline } from "@/components/workspace/ui";

const provider = new ApiExecutionProvider();

gsap.registerPlugin(CustomEase);
const bootEase = CustomEase.create("v-boot", "0.22,1,0.36,1");

/**
 * Stat-card value that counts up from 0 during Beat 4b. Outside the boot
 * sequence it renders the final text immediately.
 */
function BootStat({ text }: { text: string }) {
  const boot = useBoot();
  const statsReached = useBootPhase("stats");
  const match = text.match(/^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  const numeric = match ? Number(match[2].replace(/,/g, "")) : 0;
  const decimals = match?.[2].split(".")[1]?.length ?? 0;
  const { text: counted } = useCountUp(numeric, {
    play: boot.active && statsReached,
    durationMs: ms(700),
    decimals,
  });

  if (!match) {
    return <>{text}</>;
  }
  return (
    <>
      {match[1]}
      {boot.active ? counted : match[2]}
      {match[3]}
    </>
  );
}

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
  continuousSymbol: "NQ.v.0",
  activeContract: "NQM6",
  delayed: true,
  sourceSchema: "ohlcv-1m",
};

const FAMILY_DETAILS: Record<
  SymbolFamily,
  { name: string; exchange: string }
> = {
  YM: { name: "E-mini Dow Jones Futures", exchange: "CBOT" },
  NQ: { name: "E-mini Nasdaq-100 Futures", exchange: "CME" },
  GC: { name: "Gold Futures", exchange: "COMEX" },
};

// Every rail entry does something: the "tool" entries arm a chart tool, the
// "toggle" entries flip a mode, and "clear" removes this family's drawings.
const CHART_TOOLS: (
  | { kind: "tool"; id: ChartTool; icon: typeof Crosshair; label: string }
  | { kind: "toggle"; id: "magnet" | "drawings"; icon: typeof Crosshair; label: string }
  | { kind: "action"; id: "clear"; icon: typeof Crosshair; label: string }
)[] = [
  { kind: "tool", id: "crosshair", icon: Crosshair, label: "Crosshair" },
  { kind: "tool", id: "trend", icon: TrendingUp, label: "Trend line" },
  { kind: "tool", id: "fib", icon: Layers3, label: "Fib retracement" },
  { kind: "tool", id: "text", icon: Type, label: "Text" },
  { kind: "tool", id: "measure", icon: Ruler, label: "Measure" },
  { kind: "tool", id: "zoom", icon: ZoomIn, label: "Zoom" },
  { kind: "toggle", id: "magnet", icon: Magnet, label: "Magnet — snap to OHLC" },
  { kind: "toggle", id: "drawings", icon: Eye, label: "Hide drawings" },
  { kind: "action", id: "clear", icon: Trash2, label: "Remove drawings" },
];

const SPARK_UP = [4, 6, 5, 9, 8, 12, 10, 14, 13, 17, 15, 19, 22];
const SPARK_UP_2 = [3, 5, 8, 6, 10, 9, 13, 11, 15, 18, 16, 21, 24];
const SPARK_UP_3 = [5, 4, 7, 9, 8, 11, 14, 12, 16, 15, 19, 18, 23];
const SPARK_FLAT = [8, 12, 7, 14, 9, 16, 11, 13, 18, 12, 17, 14, 19];

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

function MiniAvatar() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-card-soft">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="13" r="6" fill="none" stroke="var(--ink)" />
        <path
          d="M5 29c1.6-6 5.8-9 11-9s9.4 3 11 9"
          fill="none"
          stroke="var(--ink)"
        />
        <path d="M12 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" fill="none" stroke="var(--ink)" strokeWidth=".8" />
      </svg>
    </span>
  );
}

export function TradingWorkspace() {
  const [workspace, setWorkspace] =
    useState<WorkspaceState>(DEFAULT_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);
  const [bars, setBars] = useState(() => generateMarketBars("NQ", "30m"));
  const [marketMeta, setMarketMeta] =
    useState<MarketDataMeta>(DEFAULT_MARKET_META);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketStreamStatus, setMarketStreamStatus] =
    useState<MarketStreamStatus>("connecting");
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const [activePanel, setActivePanel] = useState<WorkspacePanel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("candles");
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [chartTool, setChartTool] = useState<ChartTool>("crosshair");
  const [magnetOn, setMagnetOn] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [showFibPanel, setShowFibPanel] = useState(true);
  const [showTradePanel, setShowTradePanel] = useState(true);
  const [boot, setBoot] = useState<{ active: boolean; phase: BootPhase }>({
    active: false,
    phase: "done",
  });
  const [emaReveal, setEmaReveal] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const historyRequestRef = useRef(0);
  const activeContractRef = useRef(DEFAULT_MARKET_META.activeContract);
  const selectionRef = useRef({
    family: DEFAULT_WORKSPACE.family,
    timeframe: DEFAULT_WORKSPACE.timeframe,
  });
  // Back-scroll bookkeeping.
  // - seenBarTimesRef: every bar time currently held, so a prepend can dedupe.
  // - olderLoadingRef: one back-scroll request in flight at a time.
  // - requestGenRef: bumped on every family/timeframe change so an in-flight
  //   older-history response for a stale context is discarded.
  // - seenContractsRef: last active contract per family, to tell a true contract
  //   roll (reload history) from the per-reconnect mapping snapshot (do nothing).
  const seenBarTimesRef = useRef<Set<number>>(new Set());
  const olderLoadingRef = useRef(false);
  const requestGenRef = useRef(0);
  const seenContractsRef = useRef<Map<SymbolFamily, string>>(new Map());
  // True once the user has back-scrolled older bars into the current window, so
  // the offline 60s refresh (which replaces the whole window) can skip and not
  // yank them back to the latest.
  const pagedBackRef = useRef(false);
  // Request generation that has already had its one proactive prefetch, so we
  // build the initial buffer exactly once per family/timeframe (no chaining).
  const prefetchedGenRef = useRef(-1);
  // Families whose auto fibs have been re-anchored on real Databento history.
  const reconciledFamiliesRef = useRef<Set<SymbolFamily>>(new Set());

  /* ----- boot choreography (Beat 4: panel-by-panel assembly) -----
     The landing page runs Beats 1-3 (scramble-dissolve, registration
     marks, frame draw) and navigates here behind the drawn frame. One
     master GSAP timeline assembles the dashboard: outlined containers
     stagger in, then content populates (counting tickers, candle sweep,
     EMA/fib stroke-draw, stat count-ups, sparkline draws, dot pops, and
     the Buy button as the final settle). */
  useEffect(() => {
    // Read but do NOT consume the flag here: under React Strict Mode this
    // effect mounts -> cleans up -> remounts, and removing the flag on the
    // first pass would make the remount skip the boot. The flag is cleared
    // once the sequence actually commits (reduced branch / timeline onComplete).
    let flagged = false;
    try {
      flagged = window.sessionStorage.getItem(BOOT_FLAG) !== null;
    } catch {
      // sessionStorage unavailable; load plain
    }
    const clearFlag = () => {
      try {
        window.sessionStorage.removeItem(BOOT_FLAG);
      } catch {
        // ignore
      }
    };
    const html = document.documentElement;
    const main = mainRef.current;
    if (!flagged || !main) {
      html.removeAttribute("data-vboot");
      html.removeAttribute("data-vboot-reduced");
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      // reduced motion: a plain ~250ms crossfade (CSS via data-vboot-reduced)
      // straight into the fully assembled dashboard — no scramble/draw-in.
      clearFlag();
      html.removeAttribute("data-vboot");
      const cleanup = window.setTimeout(
        () => html.removeAttribute("data-vboot-reduced"),
        320,
      );
      return () => window.clearTimeout(cleanup);
    }

    // Activate the boot state on the next frame (post-mount) rather than
    // synchronously in the effect body — the GSAP timeline below drives the
    // DOM directly and is independent of this React state.
    const activateRaf = requestAnimationFrame(() => {
      setBoot({ active: true, phase: "containers" });
      setEmaReveal(0);
    });

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(main);
      const regions = [0, 1, 2, 3, 4, 5, 6]
        .map((i) => q(`[data-boot-region="${i}"]`)[0])
        .filter(Boolean);
      const content = (i: number) =>
        q(`[data-boot-region="${i}"] [data-boot-content]`);

      const tl = gsap.timeline({
        onComplete: () => {
          clearFlag();
          html.removeAttribute("data-vboot");
          setBoot({ active: false, phase: "done" });
          setEmaReveal(1);
          gsap.set(regions, { clearProps: "all" });
        },
      });
      tl.timeScale(BOOT_TIME_SCALE);

      // ---- 4a: empty outlined containers, staggered in order ----
      tl.fromTo(
        regions,
        { opacity: 0, scale: 0.97, y: 8 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.45,
          ease: bootEase,
          stagger: 0.09,
        },
        0.05,
      );

      // ---- 4b: content populates, in the specified order ----
      // top bar
      tl.to(
        content(0),
        { opacity: 1, duration: 0.3, stagger: 0.05, ease: "power2.out" },
        0.55,
      );
      // ticker cells fade, then prices count up + change flashes
      tl.to(
        content(1),
        { opacity: 1, duration: 0.3, stagger: 0.04, ease: "power2.out" },
        0.62,
      );
      tl.call(
        () => setBoot((b) => ({ ...b, phase: "tickers" })),
        [],
        0.65,
      );
      // heading + tab row
      tl.to(
        content(2),
        { opacity: 1, duration: 0.3, stagger: 0.05, ease: "power2.out" },
        0.72,
      );
      // chart: tool rail fades, candlesticks sweep in left -> right
      tl.to(
        q('[data-boot-region="3"] [data-boot-content]:not([data-boot-candles])'),
        { opacity: 1, duration: 0.3, ease: "power2.out" },
        0.8,
      );
      tl.fromTo(
        q("[data-boot-candles]"),
        { opacity: 1, clipPath: "inset(0% 100% 0% 0%)" },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          duration: 0.8,
          ease: "power2.inOut",
        },
        0.85,
      );
      // fib + trading panel interiors
      tl.to(
        content(4),
        { opacity: 1, duration: 0.3, stagger: 0.05, ease: "power2.out" },
        0.95,
      );
      tl.to(
        content(5),
        { opacity: 1, duration: 0.3, stagger: 0.05, ease: "power2.out" },
        1.05,
      );
      // EMAs draw in after the candles (progressive series data)
      tl.call(
        () => {
          const proxy = { p: 0 };
          gsap.to(proxy, {
            p: 1,
            duration: ms(450) / 1000,
            ease: "power1.inOut",
            onUpdate: () => setEmaReveal(proxy.p),
          });
        },
        [],
        1.7,
      );
      // Fibonacci levels stroke-draw after the EMAs
      tl.call(
        () => {
          const lines = q("line[data-fib-line]");
          gsap.set(lines, {
            strokeDasharray: 1,
            strokeDashoffset: 1,
            opacity: 1,
          });
          gsap.to(lines, {
            strokeDashoffset: 0,
            duration: ms(450) / 1000,
            stagger: ms(30) / 1000,
            ease: "power2.out",
          });
          gsap.to(q("[data-fib-line-label]"), {
            opacity: 1,
            duration: ms(300) / 1000,
            delay: ms(250) / 1000,
          });
        },
        [],
        2.1,
      );
      // stat cards: interiors fade, numbers count, sparklines stroke-draw
      tl.to(
        content(6),
        { opacity: 1, duration: 0.3, stagger: 0.06, ease: "power2.out" },
        1.85,
      );
      tl.call(() => setBoot((b) => ({ ...b, phase: "stats" })), [], 1.9);
      tl.call(
        () => {
          q("[data-boot-spark] path").forEach((node, index) => {
            const path = node as unknown as SVGPathElement;
            const length = path.getTotalLength();
            gsap.fromTo(
              path,
              { strokeDasharray: length, strokeDashoffset: length, opacity: 1 },
              {
                strokeDashoffset: 0,
                duration: ms(600) / 1000,
                delay: (index * ms(80)) / 1000,
                ease: "power2.out",
              },
            );
          });
        },
        [],
        1.95,
      );
      // status line homage: "> SYSTEM_READY" types out once, then fades
      tl.set(q("[data-boot-status]"), { autoAlpha: 1 }, 2.0);
      tl.call(
        () => {
          const textEl = main.querySelector("[data-boot-status-text]");
          const proxy = { n: 0 };
          const message = "> SYSTEM_READY";
          gsap.to(proxy, {
            n: message.length,
            duration: ms(450) / 1000,
            ease: "none",
            snap: { n: 1 },
            onUpdate: () => {
              if (textEl) {
                textEl.textContent = message.slice(0, proxy.n);
              }
            },
          });
        },
        [],
        2.0,
      );
      // status dots pop with a small bounce
      tl.fromTo(
        q("[data-boot-dot]"),
        { scale: 0 },
        {
          scale: 1,
          duration: 0.3,
          ease: "back.out(3)",
          stagger: 0.06,
          clearProps: "transform",
        },
        2.55,
      );
      // the Buy button settles in last
      tl.call(() => setBoot((b) => ({ ...b, phase: "buy" })), [], 2.75);
      tl.fromTo(
        q("[data-boot-buy]"),
        { autoAlpha: 0, scale: 0.95 },
        { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power2.out" },
        2.75,
      );
      // frame + status fade; interactivity unlocks on complete
      tl.to(
        q("#v-bootframe-ws"),
        { autoAlpha: 0, duration: 0.35, ease: "power1.in" },
        3.05,
      );
    }, main);

    return () => {
      cancelAnimationFrame(activateRaf);
      ctx.revert();
    };
  }, []);

  /* ----- market data plumbing ----- */
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
        seenBarTimesRef.current = new Set(history.bars.map((bar) => bar.time));
        setHasMoreHistory(history.bars.length > 0);
        pagedBackRef.current = false;
        activeContractRef.current = history.activeContract;
        // Seed the live-roll baseline so the first gateway mapping that names a
        // DIFFERENT front contract reconciles (reloads), while a matching one
        // does not spuriously reload.
        seenContractsRef.current.set(family, history.activeContract);
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
        const demoBars = generateMarketBars(family, timeframe);
        setBars(demoBars);
        seenBarTimesRef.current = new Set(demoBars.map((bar) => bar.time));
        setHasMoreHistory(true);
        pagedBackRef.current = false;
        activeContractRef.current = `${family}M6`;
        seenContractsRef.current.set(family, `${family}M6`);
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

  // Back-scroll: fetch the bars immediately before the oldest one we hold and
  // prepend them. Guarded so only one request runs at a time, responses for a
  // stale family/timeframe are dropped, and we stop at the dataset start.
  const loadOlderHistory = useCallback(
    async (beforeTime: number) => {
      if (olderLoadingRef.current || !hasMoreHistory) {
        return;
      }
      const gen = requestGenRef.current;
      const { family, timeframe } = selectionRef.current;
      olderLoadingRef.current = true;
      setLoadingOlder(true);
      try {
        // Pull a generous chunk per request so the user can scroll a long way
        // between the (slow) Databento round-trips and history feels continuous.
        const chunk = Math.min(1500, barCountFor(timeframe) * 2);
        const response = await fetch(
          `/api/market/history?family=${family}&timeframe=${timeframe}&before=${beforeTime}&count=${chunk}`,
          { cache: "no-store" },
        );
        if (!response.ok || gen !== requestGenRef.current) {
          return;
        }
        const history = (await response.json()) as { bars: MarketBar[] };
        if (gen !== requestGenRef.current) {
          return;
        }
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
        // transient network error; the next scroll re-triggers the load
      } finally {
        if (gen === requestGenRef.current) {
          olderLoadingRef.current = false;
        }
        setLoadingOlder(false);
      }
    },
    [hasMoreHistory],
  );

  // Proactive prefetch: once per family/timeframe, after the initial window has
  // loaded, pull one extra chunk in the background so the first drag-back is
  // instant. Gen-guarded so it fires exactly once per context (no chaining); the
  // user-driven loads (chart subscription) take over from there.
  useEffect(() => {
    if (
      !hydrated ||
      marketLoading ||
      bars.length === 0 ||
      !hasMoreHistory ||
      prefetchedGenRef.current === requestGenRef.current
    ) {
      return;
    }
    prefetchedGenRef.current = requestGenRef.current;
    const oldest = bars[0].time;
    const timer = window.setTimeout(() => void loadOlderHistory(oldest), 350);
    return () => window.clearTimeout(timer);
  }, [hydrated, marketLoading, bars, hasMoreHistory, loadOlderHistory]);

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
        // Merge over the defaults so states saved before newer fields (e.g.
        // `drawings`) existed hydrate cleanly.
        setWorkspace({ ...DEFAULT_WORKSPACE, ...cloudState });
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
      } else if (isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activePanel, isFullscreen]);

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
    // New context: discard any in-flight older-history response and clear the
    // dedup set (bar times collide across families/timeframes, which would
    // otherwise false-dedup the new symbol's bars). `hasMoreHistory` is re-armed
    // by the loadMarketHistory call that accompanies every family/timeframe
    // change, so it is not reset here (avoids a redundant setState in an effect).
    requestGenRef.current += 1;
    olderLoadingRef.current = false;
    seenBarTimesRef.current = new Set();
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

          const prevContract = seenContractsRef.current.get(message.family);
          const isRoll =
            prevContract !== undefined &&
            prevContract !== message.activeContract;
          seenContractsRef.current.set(message.family, message.activeContract);
          activeContractRef.current = message.activeContract;

          if (message.type === "mapping") {
            // A mapping only updates which contract is active — it does NOT mean
            // a live tick has arrived, so `delayed` is left untouched (the label
            // stays HISTORICAL until a real bar lands). Reload the back-adjusted
            // window only on a genuine contract roll; the snapshot the gateway
            // replays on every (re)connect carries the same contract and must
            // not reload (that would bounce the label and reset the view).
            setMarketMeta((current) => ({
              ...current,
              provider: "databento",
              sourceSchema: "ohlcv-1m",
              continuousSymbol: `${message.family}.v.0`,
              activeContract: message.activeContract,
            }));
            if (isRoll) {
              void loadMarketHistory(
                selectionRef.current.family,
                selectionRef.current.timeframe,
              );
            }
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
            // A real live tick: now the feed is genuinely live (not delayed).
            setMarketMeta((current) => ({
              ...current,
              provider: "databento",
              delayed: false,
              sourceSchema: "ohlcv-1m",
              continuousSymbol: `${message.family}.v.0`,
              activeContract: message.activeContract,
            }));
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
    // Historical fallback refresh. Each refresh re-pulls (and replaces) the
    // window from Databento, so keep it gentle (60s) to limit data usage;
    // real-time updates come from the live gateway when it is connected.
    const interval = window.setInterval(() => {
      // Don't clobber a back-scroll: replacing the window would discard the
      // older bars the user paged in (and a concurrent prepend would corrupt
      // the array). Skip while paged back or while a load is in flight.
      if (pagedBackRef.current || olderLoadingRef.current) {
        return;
      }
      void loadMarketHistory(workspace.family, workspace.timeframe);
    }, 60_000);
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

  // One-shot per family: once real Databento data is available, re-anchor every
  // auto (non-locked, non-manual) fib for that family from its OWN timeframe's
  // real history. First-visit fibs are seeded from the demo generator whose
  // price level is entirely different, so without this pass their lines would
  // sit nowhere near the real candles.
  useEffect(() => {
    if (!hydrated || marketMeta.provider !== "databento") {
      return;
    }
    const family = workspace.family;
    if (reconciledFamiliesRef.current.has(family)) {
      return;
    }
    reconciledFamiliesRef.current.add(family);

    const staleTimeframes = [
      ...new Set(
        workspace.fibs
          .filter(
            (fib) => fib.family === family && !fib.locked && !fib.manual,
          )
          .map((fib) => fib.timeframe),
      ),
    ];
    if (staleTimeframes.length === 0) {
      return;
    }

    void Promise.all(
      staleTimeframes.map(async (timeframe) => {
        try {
          const response = await fetch(
            `/api/market/history?family=${family}&timeframe=${timeframe}`,
            { cache: "no-store" },
          );
          if (!response.ok) {
            return null;
          }
          const history = (await response.json()) as {
            provider: string;
            bars: MarketBar[];
          };
          return history.provider === "databento" && history.bars.length > 0
            ? { timeframe, bars: history.bars }
            : null;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      const barsByTimeframe = new Map(
        results
          .filter((result): result is NonNullable<typeof result> =>
            Boolean(result),
          )
          .map((result) => [result.timeframe, result.bars]),
      );
      if (barsByTimeframe.size === 0) {
        return;
      }
      setWorkspace((current) => {
        let changed = false;
        const fibs = current.fibs.map((fib) => {
          if (fib.family !== family || fib.locked || fib.manual) {
            return fib;
          }
          const source = barsByTimeframe.get(fib.timeframe);
          if (!source) {
            return fib;
          }
          const anchors = detectFibAnchors(source, fib.direction);
          if (!anchors) {
            return fib;
          }
          changed = true;
          return { ...fib, ...anchors, updatedAt: new Date().toISOString() };
        });
        return changed ? { ...current, fibs } : current;
      });
    });
  }, [hydrated, marketMeta.provider, workspace.family, workspace.fibs]);

  /* ----- derived ----- */
  const visibleFibs = useMemo(
    () =>
      workspace.fibs.filter(
        (fib) => fib.family === workspace.family && fib.visible,
      ),
    [workspace.family, workspace.fibs],
  );

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const change = lastBar && prevBar ? lastBar.close - prevBar.close : 0;
  const changePct = prevBar ? (change / prevBar.close) * 100 : 0;
  const ema20 = useMemo(() => computeEma(bars, 20), [bars]);
  const ema50 = useMemo(() => computeEma(bars, 50), [bars]);
  // Demo NQ position rides 10.5 pts in profit against the live mark.
  const nqPnl = 10.5 * 20 * 4;
  const openPnl = nqPnl + 284 - 45.5;

  // LIVE requires both an open gateway stream AND a non-delayed mark; otherwise
  // Databento data is shown as HISTORICAL. The demo feed reads "CONNECTING LIVE
  // DATA" only while the first history pull is genuinely in flight.
  const streamLive = marketStreamStatus === "live";
  const dataLabel =
    marketMeta.provider === "databento"
      ? streamLive && !marketLoading && !marketMeta.delayed
        ? "DATABENTO LIVE"
        : "DATABENTO HISTORICAL"
      : marketStreamStatus === "unavailable"
        ? "DETERMINISTIC DEMO FEED"
        : marketLoading
          ? "CONNECTING LIVE DATA"
          : "DETERMINISTIC DEMO FEED";

  /* ----- actions ----- */
  function patchWorkspace(patch: Partial<WorkspaceState>) {
    setWorkspace((current) => ({ ...current, ...patch }));
  }

  function selectFamily(family: SymbolFamily) {
    patchWorkspace({ family });
    void loadMarketHistory(family, workspace.timeframe);
  }

  function selectTimeframe(timeframe: Timeframe) {
    patchWorkspace({ timeframe });
    void loadMarketHistory(workspace.family, timeframe);
  }

  function updateFib(id: string, patch: Partial<FibDrawing>) {
    setWorkspace((current) => ({
      ...current,
      fibs: current.fibs.map((fib) =>
        fib.id === id ? { ...fib, ...patch } : fib,
      ),
    }));
  }

  async function addFib(timeframe: Timeframe, direction: FibDirection) {
    // Anchor on REAL bars for the fib's own timeframe. The active timeframe
    // reuses the loaded chart data; any other timeframe fetches its real
    // history first (the demo generator is only the last-ditch fallback, so a
    // "5m buy fib" detects its swing from actual 5-minute candles).
    let source: MarketBar[] | null =
      timeframe === workspace.timeframe ? bars : null;
    if (!source) {
      try {
        const response = await fetch(
          `/api/market/history?family=${workspace.family}&timeframe=${timeframe}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          source = ((await response.json()) as { bars: MarketBar[] }).bars;
        }
      } catch {
        // fall through to the deterministic fallback below
      }
    }
    if (!source || source.length === 0) {
      source = generateMarketBars(workspace.family, timeframe);
    }
    const anchors = detectFibAnchors(source, direction);
    if (!anchors) {
      return;
    }

    setWorkspace((current) => {
      const replacement: FibDrawing = {
        id: nanoid(),
        family: current.family,
        timeframe,
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
                fib.timeframe === timeframe &&
                fib.direction === direction
              ),
          ),
          replacement,
        ],
      };
    });
  }

  // Drop a hand-drawn fib for the active family/timeframe. Manual layers are
  // locked so the auto-detect pass never overwrites them, and they replace the
  // single buy/sell layer that family+timeframe already owns.
  function createManualFib(
    start: FibAnchor,
    end: FibAnchor,
    direction: FibDirection,
  ) {
    setWorkspace((current) => {
      const replacement: FibDrawing = {
        id: nanoid(),
        family: current.family,
        timeframe: current.timeframe,
        direction,
        start,
        end,
        visible: true,
        locked: true,
        manual: true,
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
    // Return to the crosshair so the chart can be panned again.
    setChartTool("crosshair");
  }

  /* ----- trend line / text annotations ----- */
  function createDrawing(drawing: Omit<ChartDrawing, "id" | "updatedAt">) {
    setWorkspace((current) => ({
      ...current,
      drawings: [
        ...(current.drawings ?? []),
        { ...drawing, id: nanoid(), updatedAt: new Date().toISOString() },
      ].slice(-120),
    }));
    setChartTool("crosshair");
  }

  function updateDrawing(id: string, patch: Partial<ChartDrawing>) {
    setWorkspace((current) => ({
      ...current,
      drawings: (current.drawings ?? []).map((drawing) =>
        drawing.id === id ? { ...drawing, ...patch } : drawing,
      ),
    }));
  }

  function clearDrawings() {
    setWorkspace((current) => ({
      ...current,
      drawings: (current.drawings ?? []).filter(
        (drawing) => drawing.family !== current.family,
      ),
    }));
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

  function refreshAllFibs(direction: FibDirection) {
    for (const fib of workspace.fibs) {
      if (
        fib.family === workspace.family &&
        fib.direction === direction &&
        !fib.locked
      ) {
        void refreshFib(fib);
      }
    }
  }

  function exportFibs() {
    const payload = JSON.stringify(
      workspace.fibs.filter((fib) => fib.family === workspace.family),
      null,
      2,
    );
    void navigator.clipboard?.writeText(payload);
  }

  async function submitOrder(order: {
    side: "buy" | "sell";
    quantity: number;
    orderType: "market" | "limit" | "stop";
    price: number;
    accounts: string[];
    stopLossTicks: number | null;
    takeProfitTicks: number | null;
  }) {
    const result = await provider.submit({
      ticker: executionTicker(workspace.family, workspace.executionSize),
      action: order.side,
      quantity: order.quantity,
      targets: order.accounts,
      orderType: "market",
      signalPrice: order.price,
      stopLossPoints: order.stopLossTicks ?? undefined,
      takeProfitPoints: order.takeProfitTicks ?? undefined,
      time: new Date().toISOString(),
      test: true,
      idempotencyKey: nanoid(),
    });
    return result.accepted
      ? `${result.message} across ${order.accounts.length} account(s).`
      : result.message;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  const symbolLabel = `${workspace.family}1!`;
  const detail = FAMILY_DETAILS[workspace.family];
  // While a popup panel is open the chart falls back to the crosshair so the
  // panel owns the pointer.
  const effectiveTool: ChartTool = activePanel ? "crosshair" : chartTool;
  const visibleDrawings = useMemo(
    () =>
      (workspace.drawings ?? []).filter(
        (drawing) => drawing.family === workspace.family,
      ),
    [workspace.drawings, workspace.family],
  );

  return (
    <BootProvider value={boot}>
    <main
      ref={mainRef}
      data-theme={theme}
      aria-busy={boot.active || undefined}
      className="vw relative flex h-dvh min-w-[1280px] flex-col overflow-hidden"
    >
      {/* ----- top bar ----- */}
      <header
        data-boot-region="0"
        className="flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-panel px-6"
      >
        <button
          data-boot-content
          onClick={() => window.location.assign("/")}
          aria-label="Voltis home"
          className="text-[21px] font-semibold tracking-[-0.04em] transition-opacity hover:opacity-70"
        >
          Voltis
        </button>

        <div data-boot-content className="flex items-center gap-2.5">
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
            label={
              <span className="relative">
                <Bell size={15} />
                <span
                  data-boot-dot
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-down"
                />
              </span>
            }
            className="h-9 w-12 justify-center"
            align="right"
            menuClassName="w-56"
          >
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-medium">Notifications</p>
              <p className="mt-1.5 text-[9px] leading-4 text-ink-2">
                NQM6 approaching the 4h sell fib 0.786 level.
              </p>
            </div>
          </Dropdown>

          <Dropdown
            label={
              <span className="flex items-center gap-2.5">
                <MiniAvatar />
                <span className="text-left">
                  <span className="block text-[11px] font-medium leading-tight">
                    Yazan
                  </span>
                  <span className="flex items-center gap-1 text-[8px] text-ink-2">
                    <span
                      data-boot-dot
                      className="h-1.5 w-1.5 rounded-full bg-up"
                    />
                    Online
                  </span>
                </span>
              </span>
            }
            className="h-11 px-2.5"
            align="right"
            menuClassName="w-44"
          >
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    close();
                    window.location.assign("/settings?section=security");
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <User size={14} />
                    My Account
                  </span>
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    close();
                    window.location.assign("/settings");
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <Settings size={14} />
                    Settings
                  </span>
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    void signOut();
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <LogOut size={14} />
                    Log out
                  </span>
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      {/* ----- ticker strip ----- */}
      <div data-boot-region="1" className="shrink-0">
        <TickerStrip
          livePrice={
            workspace.family === "NQ" && lastBar ? lastBar.close : null
          }
        />
      </div>

      {/* ----- body ----- */}
      <section className="flex min-h-0 flex-1">
        {/* left column */}
        <div className="flex min-w-0 flex-1 flex-col px-5 pb-4">
          {isFullscreen ? (
            <div className="flex h-14 shrink-0 items-center justify-between">
              <button
                onClick={() => setIsFullscreen(false)}
                className="v-press flex items-center gap-2 text-[11px] font-medium text-ink"
              >
                <ArrowLeft size={14} />
                {workspace.family} Trading
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                data-testid="fullscreen-toggle"
                className="v-press flex h-9 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-[10px] font-medium"
              >
                <Minimize2 size={13} />
                Exit Fullscreen
              </button>
            </div>
          ) : (
            <div data-boot-region="2" className="shrink-0">
              <div data-boot-content className="flex shrink-0 items-center gap-3 pb-3 pt-4">
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
                <span className="text-[10px] text-ink-2">
                  {workspace.family} Trading
                </span>
              </div>

              <div data-boot-content className="flex shrink-0 items-center justify-between pb-3">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      ["Chart", null],
                      ["Positions", "positions"],
                      ["Journal", "journal"],
                      ["Analytics", "analytics"],
                    ] as const
                  ).map(([label, panel]) => (
                    <button
                      key={label}
                      onClick={() => setActivePanel(panel)}
                      className={cn(
                        "v-press h-9 rounded-xl border px-4 text-[11px] font-medium",
                        activePanel === panel
                          ? "border-transparent bg-chip text-chip-ink"
                          : "border-line bg-card text-ink-2 hover:text-ink",
                      )}
                      style={
                        activePanel === panel
                          ? { boxShadow: "var(--glow)" }
                          : undefined
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <Dropdown
                    label={
                      <span className="text-[11px] font-medium">
                        {workspace.family}
                      </span>
                    }
                    className="h-9 px-3.5"
                  >
                    {(close) =>
                      (["NQ", "YM", "GC"] as const).map((item) => (
                        <MenuItem
                          key={item}
                          active={workspace.family === item}
                          onSelect={() => {
                            selectFamily(item);
                            close();
                          }}
                        >
                          <span>{FAMILY_LABELS[item]}</span>
                          <span className="font-mono text-[8px] text-ink-3">
                            {item}1! · {FAMILY_DETAILS[item].exchange}
                          </span>
                        </MenuItem>
                      ))
                    }
                  </Dropdown>

                  <Dropdown
                    label={
                      <span className="font-mono text-[11px]">
                        {workspace.timeframe}
                      </span>
                    }
                    className="h-9 px-3"
                    menuClassName="grid grid-cols-3 gap-0.5 w-44"
                  >
                    {(close) =>
                      TIMEFRAMES.map((item) => (
                        <MenuItem
                          key={item}
                          active={workspace.timeframe === item}
                          onSelect={() => {
                            selectTimeframe(item);
                            close();
                          }}
                        >
                          <span className="font-mono">{item}</span>
                        </MenuItem>
                      ))
                    }
                  </Dropdown>

                  <Dropdown
                    label={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-label="Chart style"
                      >
                        <path
                          d="M4 2v2M4 10v2M2.8 4h2.4v6H2.8zM10 1v2M10 11v2M8.8 3h2.4v8H8.8z"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                      </svg>
                    }
                    className="h-9 px-3"
                    menuClassName="w-32"
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          active={chartStyle === "candles"}
                          onSelect={() => {
                            setChartStyle("candles");
                            close();
                          }}
                        >
                          Candles
                        </MenuItem>
                        <MenuItem
                          active={chartStyle === "line"}
                          onSelect={() => {
                            setChartStyle("line");
                            close();
                          }}
                        >
                          Line
                        </MenuItem>
                      </>
                    )}
                  </Dropdown>

                  <Dropdown
                    label={
                      <span className="text-[11px] font-medium">
                        Indicators
                      </span>
                    }
                    className="h-9 px-3.5"
                    align="right"
                    menuClassName="w-40"
                  >
                    <MenuItem
                      active={showEma20}
                      onSelect={() => setShowEma20((current) => !current)}
                    >
                      EMA 20
                      {showEma20 ? <span>✓</span> : null}
                    </MenuItem>
                    <MenuItem
                      active={showEma50}
                      onSelect={() => setShowEma50((current) => !current)}
                    >
                      EMA 50
                      {showEma50 ? <span>✓</span> : null}
                    </MenuItem>
                  </Dropdown>

                  <button
                    onClick={() => setIsFullscreen(true)}
                    data-testid="fullscreen-toggle"
                    aria-label="Fullscreen"
                    title="Fullscreen"
                    className="v-press grid h-9 w-9 place-items-center rounded-xl border border-line bg-card text-ink"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* chart card */}
          <div
            data-boot-region="3"
            className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-card"
          >
            {/* tool rail */}
            <aside
              data-boot-content
              className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line py-2"
            >
              {CHART_TOOLS.map((tool) => {
                const active =
                  tool.kind === "tool"
                    ? chartTool === tool.id
                    : tool.id === "magnet"
                      ? magnetOn
                      : tool.id === "drawings"
                        ? drawingsHidden
                        : false;
                const label =
                  tool.id === "drawings"
                    ? drawingsHidden
                      ? "Show drawings"
                      : "Hide drawings"
                    : tool.label;
                const Icon =
                  tool.id === "drawings" && drawingsHidden ? EyeOff : tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      if (tool.kind === "tool") {
                        setChartTool(tool.id);
                      } else if (tool.id === "magnet") {
                        setMagnetOn((value) => !value);
                      } else if (tool.id === "drawings") {
                        setDrawingsHidden((value) => !value);
                      } else {
                        clearDrawings();
                      }
                    }}
                    aria-label={label}
                    title={label}
                    className={cn(
                      "v-press grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                      active
                        ? "bg-card-soft text-[#4b8ee8]"
                        : "text-ink-2 hover:bg-card-soft hover:text-ink",
                    )}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
            </aside>

            {/* chart + legend */}
            <div data-boot-content data-boot-candles className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute left-3 top-2.5 z-20 select-none">
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="font-semibold text-ink">
                    {symbolLabel} · {workspace.timeframe} · {detail.exchange}
                  </span>
                  <span
                    data-boot-dot
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      marketLoading || marketStreamStatus === "connecting"
                        ? "animate-pulse bg-[#d7a33f]"
                        : "bg-up",
                    )}
                  />
                  {lastBar ? (
                    <span className="flex items-center gap-1.5 tabular-nums">
                      <span className="text-ink-2">
                        O{" "}
                        <span className="text-up">
                          {formatPrice(lastBar.open, workspace.family)}
                        </span>
                      </span>
                      <span className="text-ink-2">
                        H{" "}
                        <span className="text-up">
                          {formatPrice(lastBar.high, workspace.family)}
                        </span>
                      </span>
                      <span className="text-ink-2">
                        L{" "}
                        <span className="text-up">
                          {formatPrice(lastBar.low, workspace.family)}
                        </span>
                      </span>
                      <span className="text-ink-2">
                        C{" "}
                        <span className="text-up">
                          {formatPrice(lastBar.close, workspace.family)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          change >= 0
                            ? "text-up"
                            : "text-down",
                        )}
                      >
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(2)} ({change >= 0 ? "+" : ""}
                        {changePct.toFixed(2)}%)
                      </span>
                    </span>
                  ) : null}
                </div>
                {showEma20 && ema20.length > 0 ? (
                  <p className="mt-1 font-mono text-[9px] text-ink-2">
                    EMA 20 close{" "}
                    <span className="text-[#2ba98f]">
                      {formatPrice(
                        ema20[ema20.length - 1].value,
                        workspace.family,
                      )}
                    </span>
                  </p>
                ) : null}
                {showEma50 && ema50.length > 0 ? (
                  <p className="mt-0.5 font-mono text-[9px] text-ink-2">
                    EMA 50 close{" "}
                    <span className="text-ink-3">
                      {formatPrice(
                        ema50[ema50.length - 1].value,
                        workspace.family,
                      )}
                    </span>
                  </p>
                ) : null}
              </div>

              <MarketChart
                bars={bars}
                family={workspace.family}
                timeframe={workspace.timeframe}
                fibs={visibleFibs}
                dataLabel={dataLabel}
                theme={theme}
                chartStyle={chartStyle}
                showEma20={showEma20}
                showEma50={showEma50}
                emaReveal={emaReveal}
                tool={effectiveTool}
                magnet={magnetOn}
                hideDrawings={drawingsHidden}
                drawings={visibleDrawings}
                onCreateDrawing={createDrawing}
                onUpdateDrawing={updateDrawing}
                onLoadOlder={(oldestTime) => void loadOlderHistory(oldestTime)}
                canLoadOlder={hasMoreHistory && !marketLoading}
                isLoadingOlder={loadingOlder}
                bootActive={boot.active}
                onUpdateFib={updateFib}
                onCreateFib={createManualFib}
              />

              {/* popup panels */}
              {activePanel === "positions" ? (
                <PositionsPopup
                  nqMark={
                    workspace.family === "NQ" && lastBar
                      ? lastBar.close
                      : null
                  }
                  onClose={() => setActivePanel(null)}
                />
              ) : null}
              {activePanel === "journal" ? (
                <JournalPopup onClose={() => setActivePanel(null)} />
              ) : null}
              {activePanel === "analytics" ? (
                <AnalyticsPopup onClose={() => setActivePanel(null)} />
              ) : null}
            </div>
          </div>

          {/* stats footer */}
          <div data-boot-region="6" className="grid shrink-0 grid-cols-4 gap-3 pt-3">
            {(
              [
                ["Account Balance", "$50,000.00", undefined, SPARK_UP],
                ["Day P&L", "$1,245.30", "up", SPARK_UP_2],
                [
                  "Open P&L",
                  `$${openPnl.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
                  "up",
                  SPARK_UP_3,
                ],
                ["Win Rate", "61.42%", "flat", SPARK_FLAT],
              ] as const
            ).map(([label, value, tone, spark]) => (
              <div
                key={label}
                className="flex h-[64px] items-center justify-between rounded-xl border border-line bg-card px-4"
              >
                <div data-boot-content>
                  <p className="text-[9px] text-ink-3">{label}</p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-[15px] font-semibold tabular-nums",
                      tone === "up" && "text-up",
                    )}
                  >
                    <BootStat text={value} />
                  </p>
                </div>
                <span className="contents" data-boot-spark>
                  <Sparkline
                    data={[...spark]}
                    color={tone === "up" ? "var(--up)" : "var(--ink)"}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* fib layers column */}
        {showFibPanel ? (
          <div data-boot-region="4" className="flex shrink-0">
          <FibLayersPanel
            family={workspace.family}
            fibs={workspace.fibs}
            onCreate={addFib}
            onToggleVisible={(fib) =>
              updateFib(fib.id, { visible: !fib.visible })
            }
            onToggleLock={(fib) => updateFib(fib.id, { locked: !fib.locked })}
            onRefresh={(fib) => void refreshFib(fib)}
            onRefreshAll={refreshAllFibs}
            onDelete={(fib) =>
              setWorkspace((current) => ({
                ...current,
                fibs: current.fibs.filter((item) => item.id !== fib.id),
              }))
            }
            onExport={exportFibs}
            onClose={() => setShowFibPanel(false)}
          />
          </div>
        ) : (
          <button
            onClick={() => setShowFibPanel(true)}
            className="v-press flex w-9 shrink-0 items-center justify-center border-l border-line bg-panel text-[9px] font-medium text-ink-2 hover:text-ink"
            style={{ writingMode: "vertical-rl" }}
          >
            Fib Layers
          </button>
        )}

        {/* trading panel column */}
        {showTradePanel ? (
          <div data-boot-region="5" className="flex shrink-0">
          <TradingPanel
            family={workspace.family}
            size={workspace.executionSize}
            lastPrice={lastBar ? lastBar.close : null}
            onChangeFamily={selectFamily}
            onChangeSize={(size) => patchWorkspace({ executionSize: size })}
            onSubmit={submitOrder}
            onClose={() => setShowTradePanel(false)}
          />
          </div>
        ) : (
          <button
            onClick={() => setShowTradePanel(true)}
            className="v-press flex w-9 shrink-0 items-center justify-center border-l border-line bg-panel text-[9px] font-medium text-ink-2 hover:text-ink"
            style={{ writingMode: "vertical-rl" }}
          >
            Trading Panel
          </button>
        )}
      </section>

      <BootFrame id="v-bootframe-ws" />
    </main>
    </BootProvider>
  );
}
