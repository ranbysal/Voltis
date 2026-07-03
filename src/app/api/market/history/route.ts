import { NextRequest } from "next/server";
import { z } from "zod";
import { TIMEFRAMES } from "@/lib/domain";
import { getMarketDataProvider } from "@/lib/market-data";

// A deep Databento history pull can take several seconds; give the serverless
// function room (Vercel defaults to 10s) so cloud requests don't time out.
export const maxDuration = 60;

const requestSchema = z.object({
  family: z.enum(["YM", "NQ", "GC"]).default("YM"),
  timeframe: z.enum(TIMEFRAMES).default("30m"),
  // Back-scroll cursor (unix seconds): return the bars immediately BEFORE it.
  before: z.coerce.number().int().positive().optional(),
  count: z.coerce.number().int().positive().max(2000).optional(),
});

// Market candles are public read-only data (the public /viewer page charts
// them without signing in); the Databento key itself never leaves the server.
export async function GET(request: NextRequest) {
  const input = requestSchema.safeParse({
    family: request.nextUrl.searchParams.get("family") ?? undefined,
    timeframe: request.nextUrl.searchParams.get("timeframe") ?? undefined,
    before: request.nextUrl.searchParams.get("before") ?? undefined,
    count: request.nextUrl.searchParams.get("count") ?? undefined,
  });

  if (!input.success) {
    return Response.json(
      { error: "Invalid market history request" },
      { status: 400 },
    );
  }

  // Reject a cursor in the future (in seconds, with a small skew allowance).
  if (
    input.data.before !== undefined &&
    input.data.before > Math.floor(Date.now() / 1000) + 60
  ) {
    return Response.json(
      { error: "Invalid market history cursor" },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await getMarketDataProvider().getHistory(
        input.data.family,
        input.data.timeframe,
        input.data.count,
        input.data.before !== undefined
          ? input.data.before * 1000
          : undefined,
      ),
    );
  } catch (error) {
    console.error("Market history request failed", error);
    return Response.json(
      {
        error: "Market data is temporarily unavailable",
        detail:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 502 },
    );
  }
}
