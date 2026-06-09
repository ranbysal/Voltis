import { describe, expect, it } from "vitest";
import {
  backAdjustContinuousBars,
  historyRequest,
  parseDatabentoJsonLines,
} from "./market-data";

describe("Databento market data normalization", () => {
  it("parses JSON lines with nested record headers", () => {
    const records = parseDatabentoJsonLines(
      [
        JSON.stringify({
          hd: { ts_event: "2026-06-09T13:30:00.000000000Z" },
          open: "50000.000000000",
          high: "50010.000000000",
          low: "49990.000000000",
          close: "50005.000000000",
          volume: 42,
          symbol: "YMM6",
        }),
        "",
      ].join("\n"),
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      open: 50_000,
      close: 50_005,
      volume: 42,
      symbol: "YMM6",
    });
  });

  it("back-adjusts earlier contracts across additive rollover gaps", () => {
    const adjusted = backAdjustContinuousBars([
      {
        time: 1,
        open: 95,
        high: 101,
        low: 94,
        close: 100,
        volume: 10,
        symbol: "YMH6",
      },
      {
        time: 2,
        open: 110,
        high: 115,
        low: 109,
        close: 112,
        volume: 12,
        symbol: "YMM6",
      },
    ]);

    expect(adjusted[0]).toMatchObject({
      open: 105,
      high: 111,
      low: 104,
      close: 110,
    });
    expect(adjusted[1].open).toBe(110);
  });

  it("uses granular source bars for exchange-session timeframes", () => {
    expect(historyRequest("5m", 260).source).toBe("ohlcv-1m");
    expect(historyRequest("1d", 260).source).toBe("ohlcv-1h");
    expect(historyRequest("1w", 260).source).toBe("ohlcv-1h");
    expect(historyRequest("1M", 260).source).toBe("ohlcv-1h");
  });
});
