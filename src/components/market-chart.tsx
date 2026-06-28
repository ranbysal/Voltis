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
  type FibAnchor,
  type FibDirection,
  type FibDrawing,
  type MarketBar,
  type SymbolFamily,
  type Timeframe,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export type ChartStyle = "candles" | "line";

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
  /** When true the Fib tool is armed: click two points to drop a manual fib. */
  drawFib?: boolean;
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

function numericTime(time: Time | null): number | null {
  if (time === null) {
    return null;
  }
  if (typeof time === "number") {
    return time;
  }
  if (typeof time === "string") {
    return Math.floor(new Date(time).getTime() / 1000);
  }
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
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
  drawFib = false,
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
  const [geometry, setGeometry] = useState<FibGeometry[]>([]);
  // Manual fib drawing: first click sets `start`, pointer-move tracks `cursor`,
  // second click finalizes. Points are kept in container-relative pixels.
  const [draft, setDraft] = useState<{
    start: DraftPoint;
    cursor: DraftPoint;
  } | null>(null);
  // Reset a partial draw whenever the Fib tool is toggled on/off. This is
  // React's recommended render-time adjustment, which avoids both an effect
  // and a stale start point leaking into the next drawing session.
  const [draftArmed, setDraftArmed] = useState(drawFib);
  if (draftArmed !== drawFib) {
    setDraftArmed(drawFib);
    if (draft !== null) {
      setDraft(null);
    }
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
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [fibs, timeframe, theme, chartStyle]);

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

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) {
      return;
    }

    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, bars.length - 150),
      to: bars.length + 7,
    });
  }, [bars.length, family, timeframe, chartStyle]);

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
    const time = numericTime(chart.timeScale().coordinateToTime(x));
    if (price === null || time === null) {
      return;
    }

    const nearest = bars.reduce((best, bar) =>
      Math.abs(bar.time - time) < Math.abs(best.time - time) ? bar : best,
    );

    onUpdateFib(fib.id, {
      [anchor]: { time: nearest.time, price },
      locked: true,
      manual: true,
      updatedAt: new Date().toISOString(),
    });
  }

  // Esc cancels the current draw without leaving a partial drawing behind.
  useEffect(() => {
    if (!draft) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

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
  function coordsToAnchor(point: DraftPoint): FibAnchor | null {
    const chart = chartRef.current;
    if (!chart || bars.length === 0 || !Number.isFinite(point.price)) {
      return null;
    }
    const time = numericTime(chart.timeScale().coordinateToTime(point.x));
    if (time === null) {
      return null;
    }
    const nearest = bars.reduce((best, bar) =>
      Math.abs(bar.time - time) < Math.abs(best.time - time) ? bar : best,
    );
    return { time: nearest.time, price: point.price };
  }

  function handleDrawPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const point = draftPointFromEvent(event);
    if (!point) {
      return;
    }
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
  }

  function handleDrawPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draft) {
      return;
    }
    const point = draftPointFromEvent(event);
    if (point) {
      setDraft((current) => (current ? { ...current, cursor: point } : current));
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
        className="pointer-events-none absolute inset-0 z-10"
        width="100%"
        height="100%"
        aria-label="Fibonacci overlays"
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
      </svg>

      {!readOnly ? (
        <div
          className={cn(
            "absolute inset-0 z-30",
            drawFib ? "cursor-crosshair" : "pointer-events-none",
          )}
          onPointerDown={drawFib ? handleDrawPointerDown : undefined}
          onPointerMove={drawFib ? handleDrawPointerMove : undefined}
        />
      ) : null}

      {drawFib && !readOnly ? (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border px-2.5 py-1.5 font-mono text-[9px] shadow-sm backdrop-blur",
            theme === "dark"
              ? "border-[#15201f] bg-[#0b1212]/92 text-[#8fa9a4]"
              : "border-[#e6e5e1] bg-[#e4e0df]/92 text-[#6d7277]",
          )}
        >
          {draft
            ? "Click to place the second point · Esc to cancel"
            : "Click two points to draw a Fib · drag up = buy, down = sell"}
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
    </div>
  );
}
