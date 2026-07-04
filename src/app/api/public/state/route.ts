import { and, desc, eq } from "drizzle-orm";
import { trades, workspacePreferences } from "@/db/schema";
import { hasViewerAccess } from "@/lib/auth";
import { ensureTradingSchema, getDatabase } from "@/lib/db";

/**
 * Read-only feed for the /viewer page: the admin's open trades and fib
 * drawings — no credentials, account identifiers, or secrets are ever
 * included. When the viewer password gate is enabled, this feed honors the
 * same access check as the page itself.
 */
export async function GET() {
  if (!(await hasViewerAccess())) {
    return Response.json({ error: "Viewer access required" }, { status: 401 });
  }

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
