import { NextRequest } from "next/server";
import { z } from "zod";
import { TIMEFRAMES } from "@/lib/domain";
import { requireSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";

// A deep Databento history pull can take several seconds; give the serverless
// function room (Vercel defaults to 10s) so cloud requests don't time out.
export const maxDuration = 60;

const requestSchema = z.object({
  family: z.enum(["YM", "NQ", "GC"]).default("YM"),
  timeframe: z.enum(TIMEFRAMES).default("30m"),
});

export async function GET(request: NextRequest) {
  if (!(await requireSession())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = requestSchema.safeParse({
    family: request.nextUrl.searchParams.get("family") ?? undefined,
    timeframe: request.nextUrl.searchParams.get("timeframe") ?? undefined,
  });

  if (!input.success) {
    return Response.json(
      { error: "Invalid market history request" },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await getMarketDataProvider().getHistory(
        input.data.family,
        input.data.timeframe,
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
