"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FIB_LEVELS,
  fibPrice,
  type FibDrawing,
  type MarketBar,
  type SymbolFamily,
  type Timeframe,
} from "@/lib/domain";

type MarketChartProps = {
  bars: MarketBar[];
  family: SymbolFamily;
  timeframe: Timeframe;
  fibs: FibDrawing[];
  dataLabel: string;
  onUpdateFib: (id: string, patch: Partial<FibDrawing>) => void;
};

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

const TIMEFRAME_STYLE: Record<
  Timeframe,
  { buy: string; sell: string; opacity: number }
> = {
  "5m": { buy: "#42f5a7", sell: "#ff4d68", opacity: 1 },
  "10m": { buy: "#35eeb3", sell: "#ff5775", opacity: 0.94 },
  "30m": { buy: "#27dfbf", sell: "#f7617e", opacity: 0.88 },
  "1h": { buy: "#25cfbd", sell: "#ec6684", opacity: 0.8 },
  "4h": { buy: "#29bdae", sell: "#dd6d88", opacity: 0.72 },
  "1d": { buy: "#32a99f", sell: "#c87388", opacity: 0.6 },
  "3d": { buy: "#3e958e", sell: "#b67888", opacity: 0.5 },
  "1w": { buy: "#4f807c", sell: "#9f7c87", opacity: 0.4 },
  "1M": { buy: "#5e6f6d", sell: "#887d84", opacity: 0.32 },
};

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
  series: ISeriesApi<"Candlestick", Time>,
  fibs: FibDrawing[],
  timeframe: Timeframe,
): FibGeometry[] {
  return fibs
    .filter((fib) => fib.visible)
    .map((fib) => {
      const style = TIMEFRAME_STYLE[fib.timeframe];
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
  onUpdateFib,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef =
    useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const [geometry, setGeometry] = useState<FibGeometry[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#07090d" },
        textColor: "#768091",
        fontFamily: '"Geist Mono", ui-monospace, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(35, 42, 53, 0.48)" },
        horzLines: { color: "rgba(35, 42, 53, 0.48)" },
      },
      rightPriceScale: {
        borderColor: "#202630",
        scaleMargins: { top: 0.08, bottom: 0.08 },
        minimumWidth: 76,
      },
      timeScale: {
        borderColor: "#202630",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 2,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(131, 143, 160, 0.55)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#222a35",
        },
        horzLine: {
          color: "rgba(131, 143, 160, 0.55)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#222a35",
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

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c7c9",
      downColor: "#f04468",
      borderVisible: false,
      wickUpColor: "#22c7c9",
      wickDownColor: "#f04468",
      priceLineColor: "#20c8cb",
      priceLineWidth: 1,
      lastValueVisible: true,
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 1,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || bars.length === 0) {
      return;
    }

    series.applyOptions({
      priceFormat: {
        type: "price",
        precision: family === "YM" ? 0 : 2,
        minMove: family === "YM" ? 1 : 0.25,
      },
    });
    series.setData(
      bars.map((bar) => ({
        ...bar,
        time: bar.time as UTCTimestamp,
      })),
    );
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setGeometry(buildFibGeometry(chart, series, fibs, timeframe));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bars, family, fibs, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) {
      return;
    }

    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, bars.length - 150),
      to: bars.length + 7,
    });
  }, [bars.length, family, timeframe]);

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

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#07090d]">
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
                    x1={0}
                    x2="100%"
                    y1={y}
                    y2={y}
                    stroke={color}
                    strokeWidth={isActive ? 1.35 : 1}
                  />
                  <text
                    x={12}
                    y={y - 6}
                    fill={color}
                    fontFamily='"Geist Mono", ui-monospace, monospace'
                    fontSize={10}
                    fontWeight={600}
                    paintOrder="stroke"
                    stroke="#07090d"
                    strokeWidth={4}
                  >
                    {fib.timeframe.toUpperCase()} {fib.direction.toUpperCase()}{" "}
                    {level} |{" "}
                    {price.toLocaleString("en-US", {
                      maximumFractionDigits: family === "YM" ? 0 : 2,
                    })}
                  </text>
                </g>
              ))}

              {isActive &&
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
                      fill="#07090d"
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
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-md border border-white/[0.06] bg-[#0b0e13]/90 px-2.5 py-1.5 font-mono text-[10px] text-[#788293] shadow-xl backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-[#36d399] shadow-[0_0_8px_#36d399]" />
        {dataLabel}
      </div>
    </div>
  );
}
