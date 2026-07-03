import { and, desc, eq } from "drizzle-orm";
import { trades, workspacePreferences } from "@/db/schema";
import { ensureTradingSchema, getDatabase } from "@/lib/db";

/**
 * Public, read-only feed for the /viewer page: the admin's open trades and fib
 * drawings. This is exactly the data the viewer exists to broadcast — no
 * credentials, account identifiers, or secrets are ever included.
 */
export async function GET() {
  const database = getDatabase();
  if (!database || !(await ensureTradingSchema())) {
    return Response.json(
      { available: false, trades: [], fibs: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const adminId = process.env.VOLTIS_USER_ID ?? "yazan";

  const [openTrades, [workspace]] = await Promise.all([
    database
      .select({
        id: trades.id,
        family: trades.family,
        symbol: trades.symbol,
        side: trades.side,
        quantity: trades.quantity,
        entryPrice: trades.entryPrice,
        takeProfit: trades.takeProfit,
        stopLoss: trades.stopLoss,
        mode: trades.mode,
        openedAt: trades.openedAt,
      })
      .from(trades)
      .where(and(eq(trades.userId, adminId), eq(trades.status, "open")))
      .orderBy(desc(trades.openedAt))
      .limit(20),
    database
      .select({ state: workspacePreferences.state })
      .from(workspacePreferences)
      .where(eq(workspacePreferences.userId, adminId))
      .limit(1),
  ]);

  return Response.json(
    {
      available: true,
      trades: openTrades.map((trade) => ({
        ...trade,
        openedAt: trade.openedAt.toISOString(),
      })),
      fibs: workspace?.state?.fibs ?? [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
