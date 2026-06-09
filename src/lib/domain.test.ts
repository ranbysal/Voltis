import { describe, expect, it } from "vitest";
import {
  fibPrice,
  type FibDrawing,
} from "./domain";
import {
  detectFibAnchors,
  generateMarketBars,
} from "./market";

const baseFib: FibDrawing = {
  id: "test-fib",
  family: "YM",
  timeframe: "30m",
  direction: "buy",
  start: { time: 1, price: 100 },
  end: { time: 2, price: 200 },
  visible: true,
  locked: false,
  manual: false,
  updatedAt: "2026-06-09T12:00:00.000Z",
};

describe("fibonacci pricing", () => {
  it("matches the first-anchor-is-one convention", () => {
    expect(fibPrice(baseFib, 0)).toBe(200);
    expect(fibPrice(baseFib, 0.382)).toBeCloseTo(161.8);
    expect(fibPrice(baseFib, 0.786)).toBeCloseTo(121.4);
    expect(fibPrice(baseFib, 1)).toBe(100);
  });

  it("uses the same interpolation for sell drawings", () => {
    const sellFib = {
      ...baseFib,
      direction: "sell" as const,
      start: { time: 1, price: 200 },
      end: { time: 2, price: 100 },
    };

    expect(fibPrice(sellFib, 0)).toBe(100);
    expect(fibPrice(sellFib, 1)).toBe(200);
  });
});

describe("market fixtures", () => {
  it("generates stable sorted OHLCV fixtures", () => {
    const first = generateMarketBars("YM", "5m", 60);
    const second = generateMarketBars("YM", "5m", 60);

    expect(first).toEqual(second);
    expect(first).toHaveLength(60);
    expect(first[0].time).toBeLessThan(first[59].time);
    expect(first.every((bar) => bar.high >= bar.low)).toBe(true);
  });

  it("finds ordered buy and sell anchor pairs", () => {
    const bars = generateMarketBars("NQ", "30m", 180);
    const buy = detectFibAnchors(bars, "buy");
    const sell = detectFibAnchors(bars, "sell");

    expect(buy).not.toBeNull();
    expect(sell).not.toBeNull();
    expect(buy!.start.time).toBeLessThan(buy!.end.time);
    expect(sell!.start.time).toBeLessThan(sell!.end.time);
    expect(buy!.start.price).toBeLessThan(buy!.end.price);
    expect(sell!.start.price).toBeGreaterThan(sell!.end.price);
  });

  it("requires enough history for automatic anchors", () => {
    const bars = generateMarketBars("YM", "5m", 49);
    expect(detectFibAnchors(bars, "buy")).toBeNull();
  });
});
