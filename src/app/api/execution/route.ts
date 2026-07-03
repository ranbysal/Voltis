import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { accountConnections, trades } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import type { Environment } from "@/lib/connections";
import { decryptSecret } from "@/lib/crypto";
import { ensureTradingSchema, getDatabase } from "@/lib/db";
import {
  listTradovateAccounts,
  placeTradovateOrder,
  resolveFrontContract,
  tradovateToken,
} from "@/lib/tradovate";

const orderIntentSchema = z.object({
  ticker: z.enum(["YM", "MYM", "NQ", "MNQ", "GC", "MGC"]),
  action: z.enum(["buy", "sell", "exit", "cancel"]),
  quantity: z.number().int().positive().max(100),
  targets: z.array(z.string().min(1).max(100)).min(1).max(20),
  orderType: z.literal("market"),
  signalPrice: z.number().positive(),
  stopLossPoints: z.number().nonnegative().optional(),
  takeProfitPoints: z.number().nonnegative().optional(),
  time: z.iso.datetime(),
  test: z.boolean(),
  idempotencyKey: z.string().min(8),
});

const TICK_SIZE: Record<string, number> = {
  NQ: 0.25,
  MNQ: 0.25,
  YM: 1,
  MYM: 1,
  GC: 0.1,
  MGC: 0.1,
};

function familyOf(ticker: string): "NQ" | "YM" | "GC" {
  return ticker.replace(/^M/, "") as "NQ" | "YM" | "GC";
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ accepted: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const intent = orderIntentSchema.safeParse(body);
  if (!intent.success) {
    return Response.json(
      { accepted: false, error: "Invalid order intent" },
      { status: 400 },
    );
  }

  const order = intent.data;
  const family = familyOf(order.ticker);
  const tick = TICK_SIZE[order.ticker];
  const side = order.action === "buy" ? "long" : "short";
  const sign = order.action === "buy" ? 1 : -1;
  // The panel sends bracket distances in TICKS; convert to price points.
  const tpOffset = order.takeProfitPoints ? order.takeProfitPoints * tick : null;
  const slOffset = order.stopLossPoints ? order.stopLossPoints * tick : null;
  const takeProfit = tpOffset ? order.signalPrice + sign * tpOffset : null;
  const stopLoss = slOffset ? order.signalPrice - sign * slOffset : null;

  const database = getDatabase();
  const schemaReady = database ? await ensureTradingSchema() : false;

  // A stored Tradovate connection routes the order for real; otherwise the
  // order is validated in paper mode (and still recorded for the viewer).
  const connection =
    database && schemaReady
      ? (
          await database
            .select()
            .from(accountConnections)
            .where(eq(accountConnections.userId, session.userId))
            .limit(1)
        )[0]
      : undefined;

  async function recordTrade(input: {
    contract: string;
    mode: "paper" | "demo" | "live";
    providerOrderId?: string;
  }) {
    if (!database || !schemaReady) {
      return;
    }

    // Futures-style netting: an opposite-side order first offsets the open
    // position on the same family. A full offset closes the trade (which is
    // how the public viewer sees positions open and close); a partial offset
    // reduces it; any excess opens a new trade in the other direction.
    let remaining = order.quantity;
    const open = await database
      .select()
      .from(trades)
      .where(and(eq(trades.userId, session!.userId), eq(trades.status, "open")));
    for (const existing of open.filter(
      (trade) => trade.family === family && trade.side !== side,
    )) {
      if (remaining <= 0) {
        break;
      }
      if (existing.quantity <= remaining) {
        remaining -= existing.quantity;
        await database
          .update(trades)
          .set({ status: "closed", closedAt: new Date(order.time) })
          .where(eq(trades.id, existing.id));
      } else {
        await database
          .update(trades)
          .set({ quantity: existing.quantity - remaining })
          .where(eq(trades.id, existing.id));
        remaining = 0;
      }
    }
    if (remaining <= 0) {
      return;
    }

    await database.insert(trades).values({
      id: nanoid(),
      userId: session!.userId,
      family,
      symbol: `${order.ticker}1!`,
      contract: input.contract,
      side,
      quantity: remaining,
      entryPrice: order.signalPrice,
      takeProfit,
      stopLoss,
      mode: input.mode,
      status: "open",
      providerOrderId: input.providerOrderId ?? null,
      openedAt: new Date(order.time),
    });
  }

  if (!connection) {
    await recordTrade({ contract: order.ticker, mode: "paper" });
    return Response.json({
      accepted: true,
      mode: "paper",
      message: `${order.action.toUpperCase()} ${order.quantity} ${order.ticker} validated in paper mode`,
      intent: order,
    });
  }

  /* ------------------------- real Tradovate routing ------------------------ */

  const environment = connection.environment as Environment;
  const password = decryptSecret(connection.secret);
  if (!password) {
    return Response.json(
      {
        accepted: false,
        mode: "live",
        error: "Stored Tradovate credentials could not be read — reconnect the account in Settings",
      },
      { status: 500 },
    );
  }

  const auth = await tradovateToken({
    cacheKey: connection.id,
    username: connection.username,
    password,
    environment,
  });
  if (!auth.ok) {
    return Response.json(
      { accepted: false, mode: "live", error: auth.error },
      { status: 502 },
    );
  }

  const contract = await resolveFrontContract(
    environment,
    auth.accessToken,
    order.ticker,
  );
  if (!contract) {
    return Response.json(
      {
        accepted: false,
        mode: "live",
        error: `Could not resolve the current ${order.ticker} contract on Tradovate`,
      },
      { status: 502 },
    );
  }

  const accounts = await listTradovateAccounts(environment, auth.accessToken);
  if (accounts.length === 0) {
    return Response.json(
      {
        accepted: false,
        mode: "live",
        error: "No active Tradovate accounts are available on this login",
      },
      { status: 502 },
    );
  }
  const account = accounts[0];

  const placed = await placeTradovateOrder({
    environment,
    accessToken: auth.accessToken,
    accountId: account.id,
    accountSpec: account.name,
    action: order.action === "buy" ? "Buy" : "Sell",
    symbol: contract,
    quantity: order.quantity,
    takeProfitOffset: tpOffset,
    stopLossOffset: slOffset,
  });

  if (!placed.ok) {
    return Response.json(
      { accepted: false, mode: "live", error: placed.error },
      { status: 502 },
    );
  }

  const mode = environment === "live" ? "live" : "demo";
  await recordTrade({
    contract,
    mode,
    providerOrderId: String(placed.orderId),
  });

  return Response.json({
    accepted: true,
    mode: "live",
    providerOrderId: String(placed.orderId),
    message: `${order.action.toUpperCase()} ${order.quantity} ${contract} routed to Tradovate ${environment.toUpperCase()} (order #${placed.orderId}, account ${account.name})`,
  });
}
