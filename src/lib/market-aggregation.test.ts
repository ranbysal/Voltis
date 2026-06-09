import { describe, expect, it } from "vitest";
import type { MarketBar } from "./domain";
import {
  aggregateBars,
  applyLiveBar,
  sessionStart,
} from "./market-aggregation";

function bar(time: number, price: number, volume = 1): MarketBar {
  return {
    time,
    open: price,
    high: price + 2,
    low: price - 2,
    close: price + 1,
    volume,
  };
}

describe("CME ETH session aggregation", () => {
  it("anchors the session at 17:00 America/Chicago", () => {
    const duringSession = Date.UTC(2026, 5, 9, 23, 30) / 1000;
    expect(sessionStart(duringSession)).toBe(
      Date.UTC(2026, 5, 9, 22, 0) / 1000,
    );

    const beforeSessionOpen = Date.UTC(2026, 5, 9, 20, 0) / 1000;
    expect(sessionStart(beforeSessionOpen)).toBe(
      Date.UTC(2026, 5, 8, 22, 0) / 1000,
    );
  });

  it("aggregates intraday bars from the ETH session open", () => {
    const source = [
      bar(Date.UTC(2026, 5, 9, 22, 1) / 1000, 100, 2),
      bar(Date.UTC(2026, 5, 9, 22, 4) / 1000, 103, 3),
      bar(Date.UTC(2026, 5, 9, 22, 5) / 1000, 108, 4),
    ];
    const result = aggregateBars(source, "5m");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      time: Date.UTC(2026, 5, 9, 22, 0) / 1000,
      open: 100,
      high: 105,
      low: 98,
      close: 104,
      volume: 5,
    });
    expect(result[1].time).toBe(Date.UTC(2026, 5, 9, 22, 5) / 1000);
  });

  it("keeps pre-open and post-open bars in separate daily sessions", () => {
    const source = [
      bar(Date.UTC(2026, 5, 9, 21, 55) / 1000, 100),
      bar(Date.UTC(2026, 5, 9, 22, 5) / 1000, 110),
    ];
    const result = aggregateBars(source, "1d");

    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(Date.UTC(2026, 5, 8, 22, 0) / 1000);
    expect(result[1].time).toBe(Date.UTC(2026, 5, 9, 22, 0) / 1000);
  });

  it("merges finalized minute bars into the selected timeframe", () => {
    const current = [
      bar(Date.UTC(2026, 5, 9, 22, 0) / 1000, 100, 2),
    ];
    const next = applyLiveBar(
      current,
      bar(Date.UTC(2026, 5, 9, 22, 3) / 1000, 105, 4),
      "5m",
    );

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      open: 100,
      high: 107,
      low: 98,
      close: 106,
      volume: 6,
    });
  });
});
