import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backAdjustContinuousBars,
  clampedRangeFromError,
  DatabentoHistoricalProvider,
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

  it("clamps `end` to the available range on a data_end error", () => {
    const range = {
      start: "2026-06-18T04:10:00.000Z",
      end: "2026-06-26T04:10:17.959Z",
    };
    const body = JSON.stringify({
      detail: {
        case: "data_end_after_available_end",
        message:
          "The dataset GLBX.MDP3 has data available up to '2026-06-26 04:00:00+00:00'. The `end` in the query ('2026-06-26 04:10:17.959000+00:00') is after the available range.",
      },
    });

    expect(clampedRangeFromError(body, range)).toEqual({
      start: range.start,
      end: "2026-06-26T04:00:00.000Z",
    });
  });

  it("clamps `start` to the available range on a data_start error", () => {
    const range = {
      start: "2001-01-01T00:00:00.000Z",
      end: "2026-06-26T04:00:00.000Z",
    };
    const body = JSON.stringify({
      detail: {
        case: "data_start_before_available_start",
        message:
          "The dataset GLBX.MDP3 has data available from '2010-06-06 00:00:00+00:00'. The `start` in the query is before the available range.",
      },
    });

    expect(clampedRangeFromError(body, range)).toEqual({
      start: "2010-06-06T00:00:00.000Z",
      end: range.end,
    });
  });

  it("returns null for unrelated errors or malformed bodies", () => {
    const range = { start: "a", end: "b" };
    expect(
      clampedRangeFromError(
        JSON.stringify({ detail: { case: "auth_failed", message: "nope" } }),
        range,
      ),
    ).toBeNull();
    expect(clampedRangeFromError("not json", range)).toBeNull();
  });
});

describe("DatabentoHistoricalProvider availability recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clamps to the available end and retries instead of failing", async () => {
    const ends: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      const end = init.body.get("end") ?? "";
      ends.push(end);
      if (ends.length === 1) {
        return new Response(
          JSON.stringify({
            detail: {
              case: "data_end_after_available_end",
              message:
                "The dataset GLBX.MDP3 has data available up to '2026-06-26 04:00:00+00:00'. The `end` is after the available range.",
            },
          }),
          { status: 422 },
        );
      }
      const ndjson = [
        {
          hd: { ts_event: "2026-06-26T03:30:00.000000000Z" },
          open: "21800",
          high: "21810",
          low: "21795",
          close: "21805",
          volume: 100,
          symbol: "NQM6",
        },
        {
          hd: { ts_event: "2026-06-26T03:31:00.000000000Z" },
          open: "21805",
          high: "21815",
          low: "21800",
          close: "21812",
          volume: 120,
          symbol: "NQM6",
        },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n");
      return new Response(ndjson, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DatabentoHistoricalProvider("test-key");
    const history = await provider.getHistory("NQ", "30m", 5);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry asks Databento for exactly its reported availability boundary.
    expect(ends[1]).toBe(new Date("2026-06-26T04:00:00+00:00").toISOString());
    expect(history.provider).toBe("databento");
    expect(history.bars.length).toBeGreaterThan(0);
  });

  it("surfaces a clear error when the range cannot be recovered", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ detail: { case: "auth_error", message: "bad key" } }),
        { status: 422 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DatabentoHistoricalProvider("test-key");
    await expect(provider.getHistory("NQ", "30m", 5)).rejects.toThrow(
      /Databento history request failed \(422\)/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
