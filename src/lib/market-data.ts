import type {
  MarketBar,
  SymbolFamily,
  Timeframe,
} from "@/lib/domain";
import { aggregateBars } from "@/lib/market-aggregation";
import { generateMarketBars } from "@/lib/market";

export type MarketDataMeta = {
  provider: "demo" | "databento";
  session: "ETH";
  adjustment: "back-adjusted";
  continuousSymbol: string;
  activeContract: string;
  delayed: boolean;
  sourceSchema: "ohlcv-1m" | "ohlcv-1h" | "ohlcv-1d";
};

export type MarketHistory = MarketDataMeta & {
  bars: MarketBar[];
};

export interface MarketDataProvider {
  getHistory(
    family: SymbolFamily,
    timeframe: Timeframe,
    count?: number,
  ): Promise<MarketHistory>;
}

type DatabentoRecord = {
  hd?: { ts_event?: string | number };
  ts_event?: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  symbol?: string;
};

type ContractBar = MarketBar & { symbol: string };

const CONTINUOUS_SYMBOL: Record<SymbolFamily, string> = {
  YM: "YM.v.0",
  NQ: "NQ.v.0",
};

export function historyRequest(timeframe: Timeframe, count: number) {
  const now = new Date();
  const source:
    | "ohlcv-1m"
    | "ohlcv-1h"
    | "ohlcv-1d" =
    ["5m", "10m", "30m"].includes(timeframe)
      ? "ohlcv-1m"
      : "ohlcv-1h";
  const daysPerBar: Record<Timeframe, number> = {
    "5m": 5 / 1_440,
    "10m": 10 / 1_440,
    "30m": 30 / 1_440,
    "1h": 1 / 24,
    "4h": 1 / 6,
    "1d": 1,
    "3d": 3,
    "1w": 7,
    "1M": 31,
  };
  const calendarBuffer =
    timeframe === "1M" || timeframe === "1w" ? 1.15 : 1.35;
  const lookbackDays = Math.max(
    7,
    Math.ceil(daysPerBar[timeframe] * count * calendarBuffer),
  );
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - lookbackDays);

  return {
    source,
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

function parseTimestamp(value: string | number | undefined) {
  if (typeof value === "number") {
    return value > 10_000_000_000
      ? Math.floor(value / 1_000_000_000)
      : Math.floor(value);
  }
  if (!value) {
    throw new Error("Databento record is missing ts_event");
  }
  return Math.floor(new Date(value).getTime() / 1000);
}

function parsePrice(value: string | number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Databento returned an invalid price");
  }
  return numeric;
}

export function parseDatabentoJsonLines(payload: string): ContractBar[] {
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DatabentoRecord)
    .map((record) => ({
      time: parseTimestamp(record.hd?.ts_event ?? record.ts_event),
      open: parsePrice(record.open),
      high: parsePrice(record.high),
      low: parsePrice(record.low),
      close: parsePrice(record.close),
      volume: Number(record.volume),
      symbol: record.symbol ?? "UNKNOWN",
    }));
}

export function backAdjustContinuousBars(records: ContractBar[]) {
  const sorted = [...records].sort((a, b) => a.time - b.time);
  const rollAdjustments: { index: number; gap: number }[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].symbol !== sorted[index - 1].symbol) {
      rollAdjustments.push({
        index,
        gap: sorted[index].open - sorted[index - 1].close,
      });
    }
  }

  const output: MarketBar[] = new Array(sorted.length);
  let cumulativeAdjustment = 0;
  let rollIndex = rollAdjustments.length - 1;

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    while (
      rollIndex >= 0 &&
      index < rollAdjustments[rollIndex].index
    ) {
      cumulativeAdjustment += rollAdjustments[rollIndex].gap;
      rollIndex -= 1;
    }
    const bar = sorted[index];
    output[index] = {
      time: bar.time,
      open: bar.open + cumulativeAdjustment,
      high: bar.high + cumulativeAdjustment,
      low: bar.low + cumulativeAdjustment,
      close: bar.close + cumulativeAdjustment,
      volume: bar.volume,
    };
  }

  return output;
}

export class DemoMarketDataProvider implements MarketDataProvider {
  async getHistory(
    family: SymbolFamily,
    timeframe: Timeframe,
    count = 260,
  ): Promise<MarketHistory> {
    return {
      provider: "demo",
      session: "ETH",
      adjustment: "back-adjusted",
      continuousSymbol: `${family}.v.0`,
      activeContract: `${family}M6`,
      delayed: true,
      sourceSchema: "ohlcv-1m",
      bars: generateMarketBars(family, timeframe, count),
    };
  }
}

export class DatabentoHistoricalProvider implements MarketDataProvider {
  constructor(private readonly apiKey: string) {}

  async getHistory(
    family: SymbolFamily,
    timeframe: Timeframe,
    count = 260,
  ): Promise<MarketHistory> {
    const request = historyRequest(timeframe, count);
    const body = new URLSearchParams({
      dataset: "GLBX.MDP3",
      symbols: CONTINUOUS_SYMBOL[family],
      stype_in: "continuous",
      schema: request.source,
      start: request.start,
      end: request.end,
      encoding: "json",
      pretty_px: "true",
      pretty_ts: "true",
      map_symbols: "true",
    });
    const response = await fetch(
      "https://hist.databento.com/v0/timeseries.get_range",
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Databento history request failed (${response.status}): ${message.slice(0, 240)}`,
      );
    }

    const records = parseDatabentoJsonLines(await response.text());
    if (records.length === 0) {
      throw new Error("Databento returned no bars for the requested range");
    }

    const adjusted = backAdjustContinuousBars(records);
    const bars = aggregateBars(adjusted, timeframe).slice(-count);
    return {
      provider: "databento",
      session: "ETH",
      adjustment: "back-adjusted",
      continuousSymbol: CONTINUOUS_SYMBOL[family],
      activeContract: records[records.length - 1].symbol,
      delayed: true,
      sourceSchema: request.source,
      bars,
    };
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  return process.env.DATABENTO_API_KEY
    ? new DatabentoHistoricalProvider(process.env.DATABENTO_API_KEY)
    : new DemoMarketDataProvider();
}
