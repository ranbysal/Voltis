import {
  type FibDirection,
  type MarketBar,
  type SymbolFamily,
  type Timeframe,
} from "@/lib/domain";

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "5m": 5 * 60,
  "10m": 10 * 60,
  "30m": 30 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
  "3d": 3 * 24 * 60 * 60,
  "1w": 7 * 24 * 60 * 60,
  "1M": 30 * 24 * 60 * 60,
};

const BASE_PRICE: Record<SymbolFamily, number> = {
  YM: 50_640,
  NQ: 21_970,
};

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function alignTime(timeframe: Timeframe) {
  const step = TIMEFRAME_SECONDS[timeframe];
  const fixedNow = Math.floor(Date.UTC(2026, 5, 9, 13, 30) / 1000);
  return Math.floor(fixedNow / step) * step;
}

export function generateMarketBars(
  family: SymbolFamily,
  timeframe: Timeframe,
  count = 260,
): MarketBar[] {
  const random = mulberry32(hashSeed(`${family}:${timeframe}`));
  const step = TIMEFRAME_SECONDS[timeframe];
  const scale = family === "YM" ? 1 : 0.55;
  const timeframeScale = Math.max(1, Math.sqrt(step / 300));
  const volatility = 22 * scale * timeframeScale;
  const endTime = alignTime(timeframe);
  const bars: MarketBar[] = [];

  let close =
    BASE_PRICE[family] -
    volatility * 2.4 +
    (random() - 0.5) * volatility * 5;

  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const trend =
      Math.sin(progress * Math.PI * 3.6) * volatility * 0.35 +
      Math.sin(progress * Math.PI * 11.2) * volatility * 0.11 +
      (progress - 0.42) * volatility * 0.42;
    const impulse =
      index === Math.floor(count * 0.58)
        ? volatility * 2.2
        : index === Math.floor(count * 0.76)
          ? -volatility * 2.7
          : 0;
    const open = close;
    close =
      open +
      (random() - 0.49) * volatility * 0.82 +
      trend * 0.14 +
      impulse;
    const wick = volatility * (0.18 + random() * 0.58);
    const high = Math.max(open, close) + wick * (0.35 + random());
    const low = Math.min(open, close) - wick * (0.35 + random());

    bars.push({
      time: endTime - (count - 1 - index) * step,
      open: roundPrice(open, family),
      high: roundPrice(high, family),
      low: roundPrice(low, family),
      close: roundPrice(close, family),
      volume: Math.round(240 + random() * 2100 * timeframeScale),
    });
  }

  return bars;
}

export function tickLastBar(
  bars: MarketBar[],
  family: SymbolFamily,
  phase: number,
) {
  if (bars.length === 0) {
    return bars;
  }

  const next = [...bars];
  const current = next[next.length - 1];
  const amplitude = family === "YM" ? 5.5 : 2.75;
  const close = roundPrice(
    current.close + Math.sin(phase / 2.2) * amplitude,
    family,
  );

  next[next.length - 1] = {
    ...current,
    close,
    high: Math.max(current.high, close),
    low: Math.min(current.low, close),
    volume: current.volume + 9,
  };

  return next;
}

export function detectFibAnchors(
  bars: MarketBar[],
  direction: FibDirection,
  settings = { deviation: 20, depth: 50 },
) {
  const sample = bars.slice(-Math.min(600, bars.length));
  if (sample.length < settings.depth) {
    return null;
  }

  const pivots = findZigZagPivots(
    sample,
    settings.deviation,
    settings.depth,
  );
  for (let index = pivots.length - 1; index > 0; index -= 1) {
    const start = pivots[index - 1];
    const end = pivots[index];
    if (
      (direction === "buy" && start.type === "low" && end.type === "high") ||
      (direction === "sell" && start.type === "high" && end.type === "low")
    ) {
      return {
        start: { time: start.time, price: start.price },
        end: { time: end.time, price: end.price },
      };
    }
  }

  return orderedExtremaFallback(sample, direction);
}

type Pivot = {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
};

export function averageTrueRange(bars: MarketBar[], length = 10) {
  const values: number[] = [];
  for (let index = 0; index < bars.length; index += 1) {
    const previousClose = index > 0 ? bars[index - 1].close : bars[index].open;
    values.push(
      Math.max(
        bars[index].high - bars[index].low,
        Math.abs(bars[index].high - previousClose),
        Math.abs(bars[index].low - previousClose),
      ),
    );
  }

  return values.map((_, index) => {
    const start = Math.max(0, index - length + 1);
    const sample = values.slice(start, index + 1);
    return sample.reduce((sum, value) => sum + value, 0) / sample.length;
  });
}

export function findZigZagPivots(
  bars: MarketBar[],
  deviation = 20,
  depth = 50,
): Pivot[] {
  if (bars.length < depth) {
    return [];
  }

  const halfDepth = Math.max(2, Math.floor(depth / 2));
  const atr = averageTrueRange(bars, 10);
  const candidates: Pivot[] = [];

  for (
    let index = halfDepth;
    index < bars.length - halfDepth;
    index += 1
  ) {
    const window = bars.slice(index - halfDepth, index + halfDepth + 1);
    const isHigh = bars[index].high === Math.max(...window.map((bar) => bar.high));
    const isLow = bars[index].low === Math.min(...window.map((bar) => bar.low));
    if (isHigh) {
      candidates.push({
        index,
        time: bars[index].time,
        price: bars[index].high,
        type: "high",
      });
    }
    if (isLow) {
      candidates.push({
        index,
        time: bars[index].time,
        price: bars[index].low,
        type: "low",
      });
    }
  }

  const pivots: Pivot[] = [];
  for (const candidate of candidates.sort((a, b) => a.index - b.index)) {
    const previous = pivots[pivots.length - 1];
    if (!previous) {
      pivots.push(candidate);
      continue;
    }

    if (candidate.type === previous.type) {
      const moreExtreme =
        candidate.type === "high"
          ? candidate.price > previous.price
          : candidate.price < previous.price;
      if (moreExtreme) {
        pivots[pivots.length - 1] = candidate;
      }
      continue;
    }

    const threshold = atr[candidate.index] * deviation;
    if (Math.abs(candidate.price - previous.price) >= threshold) {
      pivots.push(candidate);
    }
  }

  return pivots;
}

function orderedExtremaFallback(
  sample: MarketBar[],
  direction: FibDirection,
) {
  let bestStartIndex = 0;
  let bestEndIndex = 1;
  let bestMove = Number.NEGATIVE_INFINITY;

  for (let start = 0; start < sample.length - 1; start += 1) {
    for (let end = start + 1; end < sample.length; end += 1) {
      const move =
        direction === "buy"
          ? sample[end].high - sample[start].low
          : sample[start].high - sample[end].low;
      if (move > bestMove) {
        bestMove = move;
        bestStartIndex = start;
        bestEndIndex = end;
      }
    }
  }

  return {
    start: {
      time: sample[bestStartIndex].time,
      price:
        direction === "buy"
          ? sample[bestStartIndex].low
          : sample[bestStartIndex].high,
    },
    end: {
      time: sample[bestEndIndex].time,
      price:
        direction === "buy"
          ? sample[bestEndIndex].high
          : sample[bestEndIndex].low,
    },
  };
}

function roundPrice(price: number, family: SymbolFamily) {
  const tick = family === "YM" ? 1 : 0.25;
  return Math.round(price / tick) * tick;
}
