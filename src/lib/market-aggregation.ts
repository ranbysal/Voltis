import type { MarketBar, Timeframe } from "@/lib/domain";

const CHICAGO_TIME_ZONE = "America/Chicago";
const minute = 60;
const hour = 60 * minute;
const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHICAGO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const sessionStartCache = new Map<number, number>();

const intradaySeconds: Partial<Record<Timeframe, number>> = {
  "5m": 5 * minute,
  "10m": 10 * minute,
  "30m": 30 * minute,
  "1h": hour,
  "4h": 4 * hour,
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(timestampSeconds: number): ZonedParts {
  const parts = zonedFormatter.formatToParts(
    new Date(timestampSeconds * 1000),
  );
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as ZonedParts;
}

function shiftDate(
  date: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
) {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function zonedDateTimeToUtc(
  date: Pick<ZonedParts, "year" | "month" | "day">,
  hourValue: number,
) {
  const target = Date.UTC(date.year, date.month - 1, date.day, hourValue);
  let guess = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = zonedParts(Math.floor(guess / 1000));
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    guess += target - representedUtc;
  }

  return Math.floor(guess / 1000);
}

export function sessionStart(timestampSeconds: number) {
  const cacheKey = Math.floor(timestampSeconds / hour);
  const cached = sessionStartCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const parts = zonedParts(timestampSeconds);
  const sessionDate =
    parts.hour >= 17 ? parts : shiftDate(parts, -1);
  const start = zonedDateTimeToUtc(sessionDate, 17);
  sessionStartCache.set(cacheKey, start);
  return start;
}

function tradingDate(timestampSeconds: number) {
  const start = zonedParts(sessionStart(timestampSeconds));
  return shiftDate(start, 1);
}

function dateOrdinal(date: Pick<ZonedParts, "year" | "month" | "day">) {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

export function timeframeBucketStart(
  timestampSeconds: number,
  timeframe: Timeframe,
) {
  const interval = intradaySeconds[timeframe];
  if (interval) {
    const start = sessionStart(timestampSeconds);
    return start + Math.floor((timestampSeconds - start) / interval) * interval;
  }

  const tradeDate = tradingDate(timestampSeconds);
  if (timeframe === "1d") {
    return sessionStart(timestampSeconds);
  }

  if (timeframe === "3d") {
    const ordinal = dateOrdinal(tradeDate);
    const groupStart = shiftDate(tradeDate, -(ordinal % 3));
    return zonedDateTimeToUtc(shiftDate(groupStart, -1), 17);
  }

  if (timeframe === "1w") {
    const weekday = new Date(
      Date.UTC(tradeDate.year, tradeDate.month - 1, tradeDate.day),
    ).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const monday = shiftDate(tradeDate, -daysSinceMonday);
    return zonedDateTimeToUtc(shiftDate(monday, -1), 17);
  }

  const firstTradingDate = {
    year: tradeDate.year,
    month: tradeDate.month,
    day: 1,
  };
  return zonedDateTimeToUtc(shiftDate(firstTradingDate, -1), 17);
}

export function aggregateBars(
  source: MarketBar[],
  timeframe: Timeframe,
): MarketBar[] {
  const sorted = [...source].sort((a, b) => a.time - b.time);
  const buckets = new Map<number, MarketBar>();

  for (const bar of sorted) {
    const time = timeframeBucketStart(bar.time, timeframe);
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { ...bar, time });
      continue;
    }

    buckets.set(time, {
      time,
      open: existing.open,
      high: Math.max(existing.high, bar.high),
      low: Math.min(existing.low, bar.low),
      close: bar.close,
      volume: existing.volume + bar.volume,
    });
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export function applyLiveBar(
  current: MarketBar[],
  sourceBar: MarketBar,
  timeframe: Timeframe,
) {
  const time = timeframeBucketStart(sourceBar.time, timeframe);
  const index = current.findIndex((bar) => bar.time === time);

  if (index === -1) {
    // Keep a generous tail: a back-scroll can grow `current` to a few thousand
    // bars, and a tighter cap would silently drop that prepended history on the
    // next live tick.
    return [...current, { ...sourceBar, time }]
      .sort((a, b) => a.time - b.time)
      .slice(-5000);
  }

  const existing = current[index];
  const next = [...current];
  next[index] = {
    time,
    open: existing.open,
    high: Math.max(existing.high, sourceBar.high),
    low: Math.min(existing.low, sourceBar.low),
    close: sourceBar.close,
    volume: existing.volume + sourceBar.volume,
  };
  return next;
}
