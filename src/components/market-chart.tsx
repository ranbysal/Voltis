"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FIB_LEVELS,
  fibPrice,
  type ChartDrawing,
  type FibAnchor,
  type FibDirection,
  type FibDrawing,
  type MarketBar,
  type SymbolFamily,
  type Timeframe,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export type ChartStyle = "candles" | "line";

/**
 * The armed chart tool. "crosshair" leaves the chart's native pan/zoom in
 * charge; every other tool intercepts pointer input: fib and trend draw
 * two-point overlays, text drops a label, measure rubber-bands a price/bar
 * readout, zoom selects a time range to jump into.
 */
export type ChartTool =
  | "crosshair"
  | "trend"
  | "fib"
  | "text"
  | "measure"
  | "zoom";

// Start loading older bars while this many are still buffered to the left of the
// viewport, so the (multi-second) fetch resolves before the user reaches the
// edge. On initial load the seed window is short enough that this also kicks a
// one-shot proactive prefetch, building a deep buffer up front.
const LOAD_OLDER_BUFFER = 160;

/** An open position to overlay on the chart (Entry / TP / SL + a marker). */
export type ChartTrade = {
  side: "long" | "short";
  quantity: number;
  entry: number;
  takeProfit: number | null;
  stopLoss: number | null;
  /** Bar time (unix seconds) the entry marker is pinned to. */
  entryTime: number;
};

type MarketChartProps = {
  bars: MarketBar[];
  family: SymbolFamily;
  timeframe: Timeframe;
  fibs: FibDrawing[];
  dataLabel: string;
  theme?: "light" | "dark";
  chartStyle?: ChartStyle;
  showEma20?: boolean;
  showEma50?: boolean;
  /** 0..1 sweep that draws the EMA lines left -> right during the boot. */
  emaReveal?: number;
  readOnly?: boolean;
  /** When set, overlays an open trade (used by the read-only Viewer). */
  trade?: ChartTrade | null;
  /**
   * Back-scroll: invoked with the oldest loaded bar time (unix seconds) when the
   * user pans near the left edge, so the owner can fetch + prepend older bars.
   */
  onLoadOlder?: (oldestBarTime: number) => void;
  /** False once the owner has reached the start of history (stops requests). */
  canLoadOlder?: boolean;
  /** True while an older-history fetch is in flight (shows a left-edge hint). */
  isLoadingOlder?: boolean;
  /** True while the boot choreography owns the chart (forces a right-edge view). */
  bootActive?: boolean;
  /** The armed tool. Defaults to the plain crosshair. */
  tool?: ChartTool;
  /** Snap drawing anchors to the nearest bar's OHLC value. */
  magnet?: boolean;
  /** Hide every drawn overlay (fibs, trend lines, text) without deleting. */
  hideDrawings?: boolean;
  /** Persisted trend-line / text annotations for the active family. */
  drawings?: ChartDrawing[];
  onCreateDrawing?: (
    drawing: Omit<ChartDrawing, "id" | "updatedAt">,
  ) => void;
  onUpdateDrawing?: (id: string, patch: Partial<ChartDrawing>) => void;
  onUpdateFib: (id: string, patch: Partial<FibDrawing>) => void;
  onCreateFib?: (
    start: FibAnchor,
    end: FibAnchor,
    direction: FibDirection,
  ) => void;
};

type DraftPoint = { x: number; y: number; price: number };

type FibGeometry = {
  fib: FibDrawing;
  color: string;
  opacity: number;
  isActive: boolean;
  lines: { level: number; price: number; y: number }[];
  startX: number | null;
  endX: number | null;
  startY: number | null;
  endY: number | null;
};

type DrawingGeometry = {
  drawing: ChartDrawing;
  x1: number | null;
  y1: number | null;
  x2: number | null;
  y2: number | null;
};

const LIGHT_TF_STYLE: Record<
  Timeframe,
  { buy: string; sell: string; opacity: number }
> = {
  "5m": { buy: "#0ca35f", sell: "#d04b56", opacity: 1 },
  "10m": { buy: "#21aa68", sell: "#d65e67", opacity: 0.94 },
  "30m": { buy: "#33b070", sell: "#d96f77", opacity: 0.88 },
  "1h": { buy: "#43b478", sell: "#d77d83", opacity: 0.8 },
  "4h": { buy: "#55b681", sell: "#ce8b90", opacity: 0.72 },
  "1d": { buy: "#67b78a", sell: "#c49a9d", opacity: 0.6 },
  "3d": { buy: "#79b794", sell: "#b8a5a7", opacity: 0.5 },
  "1w": { buy: "#8ab59d", sell: "#aaacad", opacity: 0.4 },
  "1M": { buy: "#9ab1a5", sell: "#a2a2a2", opacity: 0.32 },
};

const DARK_TF_STYLE: Record<
  Timeframe,
  { buy: string; sell: string; opacity: number }
> = {
  "5m": { buy: "#00FFEF", sell: "#ff5c64", opacity: 1 },
  "10m": { buy: "#2bd9bc", sell: "#f56b72", opacity: 0.94 },
  "30m": { buy: "#36cfb6", sell: "#ea7a80", opacity: 0.88 },
  "1h": { buy: "#41c4b0", sell: "#dd888d", opacity: 0.8 },
  "4h": { buy: "#4db8a9", sell: "#c98f93", opacity: 0.72 },
  "1d": { buy: "#58aba1", sell: "#b39497", opacity: 0.6 },
  "3d": { buy: "#639e99", sell: "#9d9899", opacity: 0.5 },
  "1w": { buy: "#6d9090", sell: "#8a9799", opacity: 0.4 },
  "1M": { buy: "#778286", sell: "#7b9496", opacity: 0.32 },
};

export function computeEma(bars: MarketBar[], length: number) {
  if (bars.length === 0) {
    return [];
  }
  const k = 2 / (length + 1);
  const out: { time: number; value: number }[] = [];
  let ema = bars[0].close;
  for (const bar of bars) {
    ema = bar.close * k + ema * (1 - k);
    out.push({ time: bar.time, value: ema });
  }
  return out;
}

function buildFibGeometry(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick", Time> | ISeriesApi<"Line", Time>,
  fibs: FibDrawing[],
  timeframe: Timeframe,
  dark: boolean,
): FibGeometry[] {
  const palette = dark ? DARK_TF_STYLE : LIGHT_TF_STYLE;
  return fibs
    .filter((fib) => fib.visible)
    .map((fib) => {
      const style = palette[fib.timeframe];
      const color = fib.direction === "buy" ? style.buy : style.sell;
      const isActive = fib.timeframe === timeframe;
      const lines = FIB_LEVELS.map((level) => ({
        level,
        price: fibPrice(fib, level),
        y: series.priceToCoordinate(fibPrice(fib, level)),
      })).filter(
        (line): line is typeof line & { y: number } => line.y !== null,
      );

      return {
        fib,
        color,
        opacity: Math.min(1, style.opacity + (isActive ? 0.16 : 0)),
        isActive,
        lines,
        startX: chart
          .timeScale()
          .timeToCoordinate(fib.start.time as UTCTimestamp),
        endX: chart
          .timeScale()
          .timeToCoordinate(fib.end.time as UTCTimestamp),
        startY: series.priceToCoordinate(fib.start.price),
        endY: series.priceToCoordinate(fib.end.price),
      };
    });
}

/** Binary search: index of the bar whose time is nearest to `time`. */
function barIndexFor(bars: MarketBar[], time: number): number | null {
  if (bars.length === 0) {
    return null;
  }
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  if (lo > 0 && Math.abs(bars[lo - 1].time - time) < Math.abs(bars[lo].time - time)) {
    return lo - 1;
  }
  return lo;
}

/**
 * Pixel coordinates for trend/text drawings. Times map through the bar's
 * LOGICAL index (not timeToCoordinate) so a line stays rendered while one of
 * its endpoints is panned outside the viewport.
 */
function buildDrawingGeometry(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick", Time> | ISeriesApi<"Line", Time>,
  bars: MarketBar[],
  drawings: ChartDrawing[],
): DrawingGeometry[] {
  const ts = chart.timeScale();
  const toX = (time: number) => {
    const index = barIndexFor(bars, time);
    return index === null
      ? null
      : ts.logicalToCoordinate(index as unknown as Parameters<
          typeof ts.logicalToCoordinate
        >[0]);
  };
  return drawings.map((drawing) => ({
    drawing,
    x1: toX(drawing.start.time),
    y1: series.priceToCoordinate(drawing.start.price),
    x2: drawing.end ? toX(drawing.end.time) : null,
    y2: drawing.end ? series.priceToCoordinate(drawing.end.price) : null,
  }));
}

export function MarketChart({
  bars,
  family,
  timeframe,
  fibs,
  dataLabel,
  theme = "light",
  chartStyle = "candles",
  showEma20 = true,
  showEma50 = true,
  emaReveal = 1,
  readOnly = false,
  trade = null,
  onLoadOlder,
  canLoadOlder = false,
  isLoadingOlder = false,
  bootActive = false,
  tool = "crosshair",
  magnet = false,
  hideDrawings = false,
  drawings = [],
  onCreateDrawing,
  onUpdateDrawing,
  onUpdateFib,
  onCreateFib,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<
    ISeriesApi<"Candlestick", Time> | ISeriesApi<"Line", Time> | null
  >(null);
  const ema20Ref = useRef<ISeriesApi<"Line", Time> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line", Time> | null>(null);
  // Back-scroll bookkeeping: detect prepend vs append/in-place between renders
  // so we can re-anchor the visible range instead of snapping to the right edge.
  const prevBarsLenRef = useRef(0);
  const prevFirstTimeRef = useRef<number | null>(null);
  const selKeyRef = useRef(`${family}:${timeframe}:${chartStyle}`);
  const [geometry, setGeometry] = useState<FibGeometry[]>([]);
  const [drawingGeometry, setDrawingGeometry] = useState<DrawingGeometry[]>([]);
  // Two-point drafts (fib + trend): first click sets `start`, pointer-move
  // tracks `cursor`, second click finalizes. Points are container-relative px.
  const [draft, setDraft] = useState<{
    start: DraftPoint;
    cursor: DraftPoint;
  } | null>(null);
  const [trendDraft, setTrendDraft] = useState<{
    start: DraftPoint;
    cursor: DraftPoint;
  } | null>(null);
  // Text tool: a floating input pinned where the user clicked.
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);
  // Measure tool: rubber-band; stays on screen after release until the next
  // press or a tool change. Logical bar indices are captured at event time so
  // the render never has to read chart refs.
  const [measure, setMeasure] = useState<{
    start: DraftPoint;
    cursor: DraftPoint;
    startLogical: number | null;
    cursorLogical: number | null;
    done: boolean;
  } | null>(null);
  // Zoom tool: horizontal range selection.
  const [zoomSel, setZoomSel] = useState<{ startX: number; curX: number } | null>(
    null,
  );
  // Reset partial interactions whenever the armed tool changes. This is
  // React's recommended render-time adjustment, which avoids both an effect
  // and stale state leaking into the next tool session.
  const [armedTool, setArmedTool] = useState(tool);
  if (armedTool !== tool) {
    setArmedTool(tool);
    if (draft !== null) setDraft(null);
    if (trendDraft !== null) setTrendDraft(null);
    if (textDraft !== null) setTextDraft(null);
    if (measure !== null) setMeasure(null);
    if (zoomSel !== null) setZoomSel(null);
  }

  const ema20Data = useMemo(
    () =>
      computeEma(bars, 20).map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    [bars],
  );
  const ema50Data = useMemo(
    () =>
      computeEma(bars, 50).map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    [bars],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const dark = theme === "dark";
    const chartBackground = dark ? "#060b0b" : "#e4e0df";
    const chartText = dark ? "#58716d" : "#54585d";
    const chartGrid = dark ? "#101a19" : "#efeeeb";
    const chartBorder = dark ? "#15201f" : "#e6e5e1";
    const upColor = dark ? "#00FFEF" : "#04a35e";
    const downColor = dark ? "#cfd8d6" : "#16181a";
    // Canvas cannot consume a CSS var(), so resolve the app mono stack
    // (--font-mono -> next/font Plex Mono) to a concrete family list.
    const plexMono = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-plex-mono")
      .trim();
    const monoFont = `${
      plexMono ? `${plexMono}, ` : ""
    }"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace`;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: chartBackground },
        textColor: chartText,
        fontFamily: monoFont,
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: chartGrid },
        horzLines: { color: chartGrid },
      },
      rightPriceScale: {
        borderColor: chartBorder,
        scaleMargins: { top: 0.08, bottom: 0.08 },
        minimumWidth: 76,
      },
      timeScale: {
        borderColor: chartBorder,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 2,
        // Don't let the user drag past the oldest loaded bar into empty space:
        // combined with loading older bars ahead of the edge, scrolling history
        // stays continuous (no void, no post-load jump).
        fixLeftEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: dark
            ? "rgba(0, 255, 239, 0.35)"
            : "rgba(31, 34, 38, 0.38)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: dark ? "#0e1717" : "#111111",
        },
        horzLine: {
          color: dark
            ? "rgba(0, 255, 239, 0.35)"
            : "rgba(31, 34, 38, 0.38)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: dark ? "#0e1717" : "#111111",
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
        vertTouchDrag: true,
      },
    });

    const series =
      chartStyle === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor,
            downColor,
            borderVisible: false,
            wickUpColor: upColor,
            wickDownColor: downColor,
            priceLineColor: upColor,
            priceLineWidth: 1,
            lastValueVisible: true,
            priceFormat: {
              type: "price",
              precision: 0,
              minMove: 1,
            },
          })
        : chart.addSeries(LineSeries, {
            color: upColor,
            lineWidth: 2,
            priceLineColor: upColor,
            lastValueVisible: true,
            priceFormat: {
              type: "price",
              precision: 0,
              minMove: 1,
            },
          });

    const ema20 = chart.addSeries(LineSeries, {
      color: dark ? "#12b5a0" : "#2ba98f",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ema50 = chart.addSeries(LineSeries, {
      color: dark ? "#3e6d85" : "#a0a6a3",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      // The chart is being recreated (theme/style swap). Reset the anchor
      // baseline so the fresh chart re-snaps cleanly instead of shifting the
      // new (default) visible range against a stale prepend baseline.
      prevBarsLenRef.current = 0;
      prevFirstTimeRef.current = null;
      selKeyRef.current = "";
    };
  }, [theme, chartStyle]);

  useEffect(() => {
    ema20Ref.current?.applyOptions({ visible: showEma20 });
    ema50Ref.current?.applyOptions({ visible: showEma50 });
  }, [showEma20, showEma50, theme, chartStyle]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || bars.length === 0) {
      return;
    }

    series.applyOptions({
      priceFormat: {
        type: "price",
        precision: family === "YM" ? 0 : 2,
        minMove: family === "YM" ? 1 : family === "GC" ? 0.1 : 0.25,
      },
    });
    if (chartStyle === "candles") {
      (series as ISeriesApi<"Candlestick", Time>).setData(
        bars.map((bar) => ({
          ...bar,
          time: bar.time as UTCTimestamp,
        })),
      );
    } else {
      (series as ISeriesApi<"Line", Time>).setData(
        bars.map((bar) => ({
          time: bar.time as UTCTimestamp,
          value: bar.close,
        })),
      );
    }
    // `theme` is a dependency because the init effect recreates the price
    // series on a theme swap; without it the new series would never be fed
    // its bar data (candles would vanish in the swapped theme).
  }, [bars, family, chartStyle, theme]);

  // Keep the Fibonacci overlay glued to the candles. lightweight-charts
  // repaints its canvas on every pan/zoom/scale frame, but the SVG overlay is
  // positioned from priceToCoordinate/timeToCoordinate, so it has to be
  // recomputed on those same frames. Previously geometry only refreshed when
  // React props changed, so while dragging the levels froze and then snapped
  // back the moment an unrelated re-render (a live bar tick) landed. A
  // per-frame sync loop recomputes the coordinates and only commits to React
  // state when something actually moved, so the levels track the chart
  // seamlessly while idle frames stay free.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      return;
    }

    let raf = 0;
    // Sentinel (not "") so the first commit always fires — including when the
    // overlay transitions to *zero* fibs. An empty geometry list serializes to
    // "", which previously matched the initial prevKey and left the last fib
    // stranded on screen after it was toggled off.
    let prevKey: string | null = null;
    let prevDrawingKey: string | null = null;
    const sync = () => {
      const next = buildFibGeometry(
        chart,
        series,
        fibs,
        timeframe,
        theme === "dark",
      );
      const key = next
        .map(
          (g) =>
            `${g.fib.id}:${g.startX},${g.endX},${g.startY},${g.endY}:` +
            g.lines.map((line) => line.y).join(","),
        )
        .join("|");
      if (key !== prevKey) {
        prevKey = key;
        setGeometry(next);
      }

      const nextDrawings = buildDrawingGeometry(chart, series, bars, drawings);
      const drawingKey = nextDrawings
        .map((g) => `${g.drawing.id}:${g.x1},${g.y1},${g.x2},${g.y2}`)
        .join("|");
      if (drawingKey !== prevDrawingKey) {
        prevDrawingKey = drawingKey;
        setDrawingGeometry(nextDrawings);
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [fibs, drawings, bars, timeframe, theme, chartStyle]);

  // EMA lines draw progressively left -> right after the candles: emaReveal
  // sweeps 0 -> 1 (driven by the boot timeline) and we feed each line series a
  // growing slice of points. At rest (emaReveal = 1) the full lines render.
  useEffect(() => {
    const ema20s = ema20Ref.current;
    const ema50s = ema50Ref.current;
    if (!ema20s || !ema50s) {
      return;
    }
    const reveal = Math.min(1, Math.max(0, emaReveal));
    ema20s.setData(ema20Data.slice(0, Math.round(ema20Data.length * reveal)));
    ema50s.setData(ema50Data.slice(0, Math.round(ema50Data.length * reveal)));
  }, [ema20Data, ema50Data, emaReveal, theme, chartStyle]);

  // Visible-range management. Snap to the right edge only on a genuine dataset
  // change (initial load, family/timeframe/style switch, boot). When older bars
  // are PREPENDED (back-scroll) we shift the existing window right by exactly the
  // number of new bars so the user's anchor candles stay put. Appends and
  // in-place live updates leave the view alone (the chart's own realtime
  // tracking keeps the right edge in view when the user is already there).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) {
      return;
    }
    const ts = chart.timeScale();
    const firstTime = bars[0].time;
    const selKey = `${family}:${timeframe}:${chartStyle}`;
    const selectionChanged = selKey !== selKeyRef.current;
    const prevLen = prevBarsLenRef.current;
    const prevFirst = prevFirstTimeRef.current;
    const isPrepend =
      !selectionChanged && prevFirst !== null && firstTime < prevFirst;

    if (selectionChanged || prevLen === 0 || bootActive) {
      ts.setVisibleLogicalRange({
        from: Math.max(0, bars.length - 150),
        to: bars.length + 7,
      });
    } else if (isPrepend) {
      const prepended = bars.length - prevLen;
      const range = ts.getVisibleLogicalRange();
      if (range && prepended > 0) {
        ts.setVisibleLogicalRange({
          from: range.from + prepended,
          to: range.to + prepended,
        });
      }
    }

    selKeyRef.current = selKey;
    prevBarsLenRef.current = bars.length;
    prevFirstTimeRef.current = firstTime;
  }, [bars, family, timeframe, chartStyle, bootActive]);

  // Fire onLoadOlder EARLY — while there's still a buffer of bars to the left of
  // the viewport — so the (slow) fetch resolves before the user reaches the
  // edge and history scrolls continuously. Uses the library's own
  // barsInLogicalRange().barsBefore signal (the official infinite-history
  // pattern). Concurrency/debounce is the owner's job (one request in flight),
  // so firing repeatedly is harmless.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !onLoadOlder) {
      return;
    }
    const ts = chart.timeScale();
    const maybeLoad = () => {
      if (bars.length === 0 || !canLoadOlder) {
        return;
      }
      const range = ts.getVisibleLogicalRange();
      if (!range) {
        return;
      }
      const info = series.barsInLogicalRange(range);
      // barsBefore < BUFFER (or negative = already showing whitespace) → top up.
      if (info && info.barsBefore < LOAD_OLDER_BUFFER) {
        onLoadOlder(bars[0].time);
      }
    };
    // Only react to real range changes (user pan/zoom). We deliberately do NOT
    // call maybeLoad() eagerly here: right after a prepend the visible-range
    // shift hasn't settled yet, so an immediate re-check would read a stale
    // (small) barsBefore and fire another load — chaining requests. The owner
    // does a single proactive prefetch for the initial buffer instead.
    ts.subscribeVisibleLogicalRangeChange(maybeLoad);
    return () => ts.unsubscribeVisibleLogicalRangeChange(maybeLoad);
    // theme/chartStyle are deps because the init effect recreates the chart (and
    // its timeScale) on those changes; without them the subscription would be
    // left on the disposed chart and back-scroll would silently stop working.
  }, [bars, onLoadOlder, canLoadOlder, theme, chartStyle]);

  // Trade overlay: Entry / Take Profit / Stop Loss price lines plus a position
  // marker, for the read-only Viewer. A no-op when `trade` is null (the admin
  // chart passes nothing here). Cleanup is guarded because a theme/style swap
  // disposes the series before this effect's cleanup runs.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !trade) {
      return;
    }

    const dark = theme === "dark";
    const entryColor = dark ? "#5b9bff" : "#2f6fe0";
    const tpColor = dark ? "#00FFEF" : "#04a35e";
    const slColor = dark ? "#ff5c64" : "#e5484d";
    const fmt = (value: number) =>
      value.toLocaleString("en-US", {
        minimumFractionDigits: family === "YM" ? 0 : 2,
        maximumFractionDigits: family === "YM" ? 0 : 2,
      });

    const lines: IPriceLine[] = [];
    const addLine = (price: number, color: string, title: string) =>
      lines.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        }),
      );

    if (trade.takeProfit !== null) {
      addLine(trade.takeProfit, tpColor, "Take Profit");
    }
    addLine(trade.entry, entryColor, "Entry");
    if (trade.stopLoss !== null) {
      addLine(trade.stopLoss, slColor, "Stop Loss");
    }

    const bounds = [trade.entry, trade.takeProfit, trade.stopLoss].filter(
      (value): value is number => value !== null,
    );
    const lo = Math.min(...bounds);
    const hi = Math.max(...bounds);
    series.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const result = original();
        if (!result || !result.priceRange) {
          return { priceRange: { minValue: lo, maxValue: hi } };
        }
        return {
          ...result,
          priceRange: {
            minValue: Math.min(result.priceRange.minValue, lo),
            maxValue: Math.max(result.priceRange.maxValue, hi),
          },
        };
      },
    });

    const markers = createSeriesMarkers(series, [
      {
        time: trade.entryTime as UTCTimestamp,
        position: "belowBar",
        shape: trade.side === "long" ? "arrowUp" : "arrowDown",
        color: entryColor,
        text: `${trade.side === "long" ? "Long" : "Short"} ${trade.quantity} @ ${fmt(trade.entry)}`,
      },
    ]);

    return () => {
      try {
        lines.forEach((line) => series.removePriceLine(line));
        markers.detach();
        series.applyOptions({ autoscaleInfoProvider: undefined });
      } catch {
        // series disposed by a theme/style swap; chart.remove() handles cleanup
      }
    };
  }, [trade, theme, chartStyle, family, bars]);

  function handleAnchorMove(
    event: ReactPointerEvent<SVGCircleElement>,
    fib: FibDrawing,
    anchor: "start" | "end",
  ) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const chart = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    const nearest = barAtX(x);
    if (price === null || !nearest) {
      return;
    }

    onUpdateFib(fib.id, {
      [anchor]: { time: nearest.time, price },
      locked: true,
      manual: true,
      updatedAt: new Date().toISOString(),
    });
  }

  // Esc cancels the current interaction without leaving a partial state.
  useEffect(() => {
    if (!draft && !trendDraft && !textDraft && !measure && !zoomSel) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        setTrendDraft(null);
        setTextDraft(null);
        setMeasure(null);
        setZoomSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, trendDraft, textDraft, measure, zoomSel]);

  // Resolve a pointer event to a container-relative point and its price. Refs
  // are read only here, inside event handlers — never during render.
  function draftPointFromEvent(
    event: ReactPointerEvent<HTMLDivElement>,
  ): DraftPoint | null {
    const container = containerRef.current;
    const series = seriesRef.current;
    if (!container || !series) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    return { x, y, price: price ?? Number.NaN };
  }

  // Snap a draft point to the nearest bar to produce a persistable anchor.
  // With the magnet armed, the price additionally snaps to whichever of that
  // bar's O/H/L/C values is closest (TradingView's magnet behavior).
  // Map an x coordinate to the nearest bar via the LOGICAL index —
  // coordinateToTime returns null over whitespace, while coordinateToLogical
  // always resolves; clamping pins clicks in the right-offset gutter (or past
  // the left edge) to the nearest real bar.
  function barAtX(x: number): MarketBar | null {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) {
      return null;
    }
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) {
      return null;
    }
    const index = Math.min(
      bars.length - 1,
      Math.max(0, Math.round(Number(logical))),
    );
    return bars[index];
  }

  function coordsToAnchor(point: DraftPoint): FibAnchor | null {
    if (!Number.isFinite(point.price)) {
      return null;
    }
    const nearest = barAtX(point.x);
    if (!nearest) {
      return null;
    }
    let price = point.price;
    if (magnet) {
      price = [nearest.open, nearest.high, nearest.low, nearest.close].reduce(
        (best, value) =>
          Math.abs(value - point.price) < Math.abs(best - point.price)
            ? value
            : best,
      );
    }
    return { time: nearest.time, price };
  }

  /* ------------------------------ tool input ------------------------------ */

  function handleToolPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Cancel the browser's default mousedown focus handling: without this the
    // text tool's freshly-mounted input is blurred (and thus committed empty
    // and unmounted) the instant the same click's focus disposition lands on
    // the non-focusable overlay.
    event.preventDefault();
    const point = draftPointFromEvent(event);
    if (!point) {
      return;
    }

    if (tool === "fib") {
      if (!draft) {
        setDraft({ start: point, cursor: point });
        return;
      }
      const start = coordsToAnchor(draft.start);
      const end = coordsToAnchor(point);
      setDraft(null);
      if (start && end) {
        const direction: FibDirection =
          end.price >= start.price ? "buy" : "sell";
        onCreateFib?.(start, end, direction);
      }
      return;
    }

    if (tool === "trend") {
      if (!trendDraft) {
        setTrendDraft({ start: point, cursor: point });
        return;
      }
      const start = coordsToAnchor(trendDraft.start);
      const end = coordsToAnchor(point);
      setTrendDraft(null);
      if (start && end && onCreateDrawing) {
        onCreateDrawing({ family, kind: "trend", start, end, text: null });
      }
      return;
    }

    if (tool === "text") {
      // One floating input at a time; a second click relocates it.
      setTextDraft({ x: point.x, y: point.y, value: textDraft?.value ?? "" });
      return;
    }

    if (tool === "measure") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const logical = chartRef.current
        ?.timeScale()
        .coordinateToLogical(point.x);
      setMeasure({
        start: point,
        cursor: point,
        startLogical: logical === null || logical === undefined ? null : Number(logical),
        cursorLogical: logical === null || logical === undefined ? null : Number(logical),
        done: false,
      });
      return;
    }

    if (tool === "zoom") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setZoomSel({ startX: point.x, curX: point.x });
    }
  }

  function handleToolPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const point = draftPointFromEvent(event);
    if (!point) {
      return;
    }
    if (tool === "fib" && draft) {
      setDraft((current) => (current ? { ...current, cursor: point } : current));
      return;
    }
    if (tool === "trend" && trendDraft) {
      setTrendDraft((current) =>
        current ? { ...current, cursor: point } : current,
      );
      return;
    }
    if (tool === "measure" && measure && !measure.done) {
      const logical = chartRef.current
        ?.timeScale()
        .coordinateToLogical(point.x);
      setMeasure((current) =>
        current
          ? {
              ...current,
              cursor: point,
              cursorLogical:
                logical === null || logical === undefined
                  ? current.cursorLogical
                  : Number(logical),
            }
          : current,
      );
      return;
    }
    if (tool === "zoom" && zoomSel) {
      setZoomSel((current) =>
        current ? { ...current, curX: point.x } : current,
      );
    }
  }

  function handleToolPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (tool === "measure" && measure) {
      // Keep the readout on screen until the next press or a tool change.
      setMeasure((current) => (current ? { ...current, done: true } : current));
      return;
    }

    if (tool === "zoom" && zoomSel) {
      const chart = chartRef.current;
      setZoomSel(null);
      if (!chart) {
        return;
      }
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) {
        return;
      }
      const from = ts.coordinateToLogical(Math.min(zoomSel.startX, zoomSel.curX));
      const to = ts.coordinateToLogical(Math.max(zoomSel.startX, zoomSel.curX));
      if (from === null || to === null) {
        return;
      }
      if (Math.abs(zoomSel.curX - zoomSel.startX) < 8) {
        // A plain click zooms in 2x around the clicked bar.
        const center = Number(from);
        const half = (range.to - range.from) / 4;
        ts.setVisibleLogicalRange({ from: center - half, to: center + half });
      } else {
        ts.setVisibleLogicalRange({ from: Number(from), to: Number(to) });
      }
    }
  }

  function commitTextDraft() {
    if (!textDraft) {
      return;
    }
    const value = textDraft.value.trim();
    const anchor = coordsToAnchor({
      x: textDraft.x,
      y: textDraft.y,
      price: seriesRef.current?.coordinateToPrice(textDraft.y) ?? Number.NaN,
    });
    setTextDraft(null);
    if (value && anchor && onCreateDrawing) {
      onCreateDrawing({ family, kind: "text", start: anchor, end: null, text: value });
    }
  }

  function handleDrawingAnchorMove(
    event: ReactPointerEvent<SVGCircleElement>,
    drawing: ChartDrawing,
    anchor: "start" | "end",
  ) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const chart = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container || !onUpdateDrawing) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const point: DraftPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      price: series.coordinateToPrice(event.clientY - rect.top) ?? Number.NaN,
    };
    const next = coordsToAnchor(point);
    if (next) {
      onUpdateDrawing(drawing.id, {
        [anchor]: next,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return (
    <div
      className={cn(
        "relative h-full min-h-0 overflow-hidden",
        theme === "dark" ? "bg-[#060b0b]" : "bg-[#e4e0df]",
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      <svg
        className={cn(
          "pointer-events-none absolute inset-0 z-10",
          hideDrawings && "hidden",
        )}
        width="100%"
        height="100%"
        aria-label="Chart drawings"
        data-fib-count={fibs.length}
        data-geometry-count={geometry.length}
      >
        {geometry.map(
          ({
            fib,
            color,
            opacity,
            isActive,
            lines,
            startX,
            endX,
            startY,
            endY,
          }) => (
            <g key={fib.id} opacity={opacity}>
              {lines.map(({ level, price, y }) => (
                <g key={level}>
                  <line
                    data-fib-line
                    pathLength={1}
                    x1={0}
                    x2="100%"
                    y1={y}
                    y2={y}
                    stroke={color}
                    strokeWidth={isActive ? 1.35 : 1}
                  />
                  <text
                    data-fib-line-label
                    x="100%"
                    dx={-92}
                    y={y - 6}
                    textAnchor="end"
                    fill={color}
                    style={{ fontFamily: "var(--font-mono)" }}
                    fontSize={10}
                    fontWeight={600}
                    paintOrder="stroke"
                    stroke={theme === "dark" ? "#060b0b" : "#e4e0df"}
                    strokeWidth={4}
                  >
                    {level}{" "}
                    {`(${price.toLocaleString("en-US", {
                      minimumFractionDigits: family === "YM" ? 0 : 2,
                      maximumFractionDigits: family === "YM" ? 0 : 2,
                    })})`}
                  </text>
                </g>
              ))}

              {isActive &&
              !readOnly &&
              startX !== null &&
              endX !== null &&
              startY !== null &&
              endY !== null ? (
                <>
                  <line
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke={color}
                    strokeWidth={1.4}
                    strokeDasharray="7 7"
                  />
                  {[
                    { key: "start" as const, x: startX, y: startY },
                    { key: "end" as const, x: endX, y: endY },
                  ].map((anchor) => (
                    <circle
                      key={anchor.key}
                      className="pointer-events-auto cursor-grab active:cursor-grabbing"
                      cx={anchor.x}
                      cy={anchor.y}
                      r={6}
                      fill={theme === "dark" ? "#0b1212" : "#ffffff"}
                      stroke={color}
                      strokeWidth={2}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) =>
                        handleAnchorMove(event, fib, anchor.key)
                      }
                      onPointerUp={(event) => {
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      }}
                    />
                  ))}
                </>
              ) : null}
            </g>
          ),
        )}

        {draft
          ? (() => {
              const dark = theme === "dark";
              const style = (dark ? DARK_TF_STYLE : LIGHT_TF_STYLE)[timeframe];
              const direction =
                draft.cursor.y < draft.start.y ? "buy" : "sell";
              const color = direction === "buy" ? style.buy : style.sell;
              const pricesKnown =
                Number.isFinite(draft.start.price) &&
                Number.isFinite(draft.cursor.price);
              return (
                <g opacity={Math.min(1, style.opacity + 0.16)}>
                  {FIB_LEVELS.map((level) => {
                    const y =
                      draft.cursor.y +
                      level * (draft.start.y - draft.cursor.y);
                    const price = pricesKnown
                      ? draft.cursor.price +
                        level * (draft.start.price - draft.cursor.price)
                      : null;
                    return (
                      <g key={level}>
                        <line
                          x1={0}
                          x2="100%"
                          y1={y}
                          y2={y}
                          stroke={color}
                          strokeWidth={1.2}
                          strokeDasharray="2 4"
                          opacity={0.85}
                        />
                        {price !== null ? (
                          <text
                            x="100%"
                            dx={-92}
                            y={y - 6}
                            textAnchor="end"
                            fill={color}
                            style={{ fontFamily: "var(--font-mono)" }}
                            fontSize={10}
                            fontWeight={600}
                            paintOrder="stroke"
                            stroke={dark ? "#060b0b" : "#e4e0df"}
                            strokeWidth={4}
                          >
                            {level}{" "}
                            {`(${price.toLocaleString("en-US", {
                              minimumFractionDigits: family === "YM" ? 0 : 2,
                              maximumFractionDigits: family === "YM" ? 0 : 2,
                            })})`}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                  <line
                    x1={draft.start.x}
                    y1={draft.start.y}
                    x2={draft.cursor.x}
                    y2={draft.cursor.y}
                    stroke={color}
                    strokeWidth={1.4}
                    strokeDasharray="7 7"
                  />
                  {[draft.start, draft.cursor].map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r={5}
                      fill={dark ? "#0b1212" : "#ffffff"}
                      stroke={color}
                      strokeWidth={2}
                    />
                  ))}
                </g>
              );
            })()
          : null}

        {/* Persisted trend lines + text labels */}
        {/* eslint-disable-next-line react-hooks/refs -- false positive: refs are
            only touched inside pointer-event handlers (same pattern as the fib
            anchors above, which the rule accepts); nothing reads a ref in render. */}
        {drawingGeometry.map(({ drawing, x1, y1, x2, y2 }) => {
          const accent = theme === "dark" ? "#5b9bff" : "#2f6fe0";
          if (drawing.kind === "text") {
            return x1 !== null && y1 !== null ? (
              <text
                key={drawing.id}
                x={x1}
                y={y1}
                fill={accent}
                style={{ fontFamily: "var(--font-mono)" }}
                fontSize={11}
                fontWeight={600}
                paintOrder="stroke"
                stroke={theme === "dark" ? "#060b0b" : "#e4e0df"}
                strokeWidth={4}
              >
                {drawing.text}
              </text>
            ) : null;
          }
          if (x1 === null || y1 === null || x2 === null || y2 === null) {
            return null;
          }
          return (
            <g key={drawing.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={accent}
                strokeWidth={1.6}
              />
              {!readOnly && onUpdateDrawing
                ? (
                    [
                      { key: "start" as const, x: x1, y: y1 },
                      { key: "end" as const, x: x2, y: y2 },
                    ]
                  ).map((anchor) => (
                    <circle
                      key={anchor.key}
                      className="pointer-events-auto cursor-grab active:cursor-grabbing"
                      cx={anchor.x}
                      cy={anchor.y}
                      r={5}
                      fill={theme === "dark" ? "#0b1212" : "#ffffff"}
                      stroke={accent}
                      strokeWidth={2}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) =>
                        handleDrawingAnchorMove(event, drawing, anchor.key)
                      }
                      onPointerUp={(event) => {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                    />
                  ))
                : null}
            </g>
          );
        })}

        {/* Trend-line draft */}
        {trendDraft ? (
          <g>
            <line
              x1={trendDraft.start.x}
              y1={trendDraft.start.y}
              x2={trendDraft.cursor.x}
              y2={trendDraft.cursor.y}
              stroke={theme === "dark" ? "#5b9bff" : "#2f6fe0"}
              strokeWidth={1.6}
              strokeDasharray="6 6"
            />
            {[trendDraft.start, trendDraft.cursor].map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={5}
                fill={theme === "dark" ? "#0b1212" : "#ffffff"}
                stroke={theme === "dark" ? "#5b9bff" : "#2f6fe0"}
                strokeWidth={2}
              />
            ))}
          </g>
        ) : null}
      </svg>

      {/* Transient tool overlays (measure readout, zoom selection) — separate
          from the drawings SVG so they still work while drawings are hidden. */}
      <svg
        className="pointer-events-none absolute inset-0 z-10"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        {measure
          ? (() => {
              const up = measure.cursor.y <= measure.start.y;
              const color = up
                ? theme === "dark"
                  ? "#00FFEF"
                  : "#04a35e"
                : theme === "dark"
                  ? "#ff5c64"
                  : "#e5484d";
              const left = Math.min(measure.start.x, measure.cursor.x);
              const width = Math.abs(measure.cursor.x - measure.start.x);
              const top = Math.min(measure.start.y, measure.cursor.y);
              const height = Math.abs(measure.cursor.y - measure.start.y);
              const priceDelta =
                Number.isFinite(measure.start.price) &&
                Number.isFinite(measure.cursor.price)
                  ? measure.cursor.price - measure.start.price
                  : null;
              const pct =
                priceDelta !== null && measure.start.price !== 0
                  ? (priceDelta / measure.start.price) * 100
                  : null;
              const barSpan =
                measure.startLogical !== null && measure.cursorLogical !== null
                  ? Math.round(
                      Math.abs(measure.cursorLogical - measure.startLogical),
                    )
                  : null;
              return (
                <g>
                  <rect
                    x={left}
                    y={top}
                    width={Math.max(width, 1)}
                    height={Math.max(height, 1)}
                    fill={color}
                    opacity={0.1}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {priceDelta !== null ? (
                    <text
                      x={left + Math.max(width, 1) / 2}
                      y={Math.max(12, top - 8)}
                      textAnchor="middle"
                      fill={color}
                      style={{ fontFamily: "var(--font-mono)" }}
                      fontSize={10}
                      fontWeight={600}
                      paintOrder="stroke"
                      stroke={theme === "dark" ? "#060b0b" : "#e4e0df"}
                      strokeWidth={4}
                    >
                      {`${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(2)}  (${
                        pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : ""
                      }${barSpan !== null ? ` · ${barSpan} bars` : ""})`}
                    </text>
                  ) : null}
                </g>
              );
            })()
          : null}

        {zoomSel ? (
          <rect
            x={Math.min(zoomSel.startX, zoomSel.curX)}
            y={0}
            width={Math.max(Math.abs(zoomSel.curX - zoomSel.startX), 1)}
            height="100%"
            fill={theme === "dark" ? "#5b9bff" : "#2f6fe0"}
            opacity={0.12}
          />
        ) : null}
      </svg>

      {(() => {
        // The crosshair leaves the chart's native pan/zoom in charge. Every
        // other tool intercepts pointer input; on the read-only viewer only
        // the non-mutating tools (measure, zoom) are available.
        const intercepts =
          tool !== "crosshair" &&
          (!readOnly || tool === "measure" || tool === "zoom");
        if (!intercepts) {
          return null;
        }
        return (
          <div
            className={cn(
              "absolute inset-0 z-30",
              tool === "zoom" ? "cursor-zoom-in" : "cursor-crosshair",
            )}
            onPointerDown={handleToolPointerDown}
            onPointerMove={handleToolPointerMove}
            onPointerUp={handleToolPointerUp}
          />
        );
      })()}

      {textDraft && !readOnly ? (
        <input
          autoFocus
          value={textDraft.value}
          placeholder="Type · Enter to place"
          onChange={(event) =>
            setTextDraft((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitTextDraft();
            } else if (event.key === "Escape") {
              setTextDraft(null);
            }
          }}
          onBlur={commitTextDraft}
          className={cn(
            "absolute z-40 w-44 rounded-md border px-2 py-1 font-mono text-[10px] shadow-sm outline-none backdrop-blur",
            theme === "dark"
              ? "border-[#15201f] bg-[#0b1212]/95 text-[#d9e6e3]"
              : "border-[#e6e5e1] bg-[#ffffff]/95 text-[#1f2226]",
          )}
          style={{ left: textDraft.x, top: textDraft.y }}
        />
      ) : null}

      {tool !== "crosshair" &&
      (!readOnly || tool === "measure" || tool === "zoom") ? (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border px-2.5 py-1.5 font-mono text-[9px] shadow-sm backdrop-blur",
            theme === "dark"
              ? "border-[#15201f] bg-[#0b1212]/92 text-[#8fa9a4]"
              : "border-[#e6e5e1] bg-[#e4e0df]/92 text-[#6d7277]",
          )}
        >
          {tool === "fib"
            ? draft
              ? "Click to place the second point · Esc to cancel"
              : "Click two points to draw a Fib · drag up = buy, down = sell"
            : tool === "trend"
              ? trendDraft
                ? "Click to place the second point · Esc to cancel"
                : "Click two points to draw a trend line"
              : tool === "text"
                ? "Click to place a label · Enter commits · Esc cancels"
                : tool === "measure"
                  ? "Drag to measure price and bars · Esc clears"
                  : "Drag a region to zoom in · click zooms 2x"}
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[9px] shadow-sm backdrop-blur",
          theme === "dark"
            ? "border-[#15201f] bg-[#0b1212]/92 text-[#8fa9a4]"
            : "border-[#e6e5e1] bg-[#e4e0df]/92 text-[#6d7277]",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            theme === "dark" ? "bg-[#00FFEF]" : "bg-[#04a35e]",
          )}
        />
        {dataLabel}
      </div>

      {/* Left-edge hint while older bars stream in, so the brief edge-resistance
          reads as intentional rather than a frozen chart. */}
      {isLoadingOlder ? (
        <div
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 z-20 -translate-y-1/2 flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] shadow-sm backdrop-blur",
            theme === "dark"
              ? "border-[#15201f] bg-[#0b1212]/92 text-[#8fa9a4]"
              : "border-[#e6e5e1] bg-[#e4e0df]/92 text-[#6d7277]",
          )}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent",
            )}
          />
          Loading history
        </div>
      ) : null}
    </div>
  );
}
