import { z } from "zod";
import { requireSession } from "@/lib/auth";

const orderIntentSchema = z.object({
  ticker: z.enum(["YM", "MYM", "NQ", "MNQ"]),
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

export async function POST(request: Request) {
  if (!(await requireSession())) {
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

  if (
    process.env.TRADING_MODE !== "live" ||
    !process.env.TRADERSPOST_WEBHOOK_URL
  ) {
    return Response.json({
      accepted: true,
      mode: "paper",
      message: `${intent.data.action.toUpperCase()} ${intent.data.quantity} ${intent.data.ticker} recorded in paper mode`,
      intent: intent.data,
    });
  }

  return Response.json(
    {
      accepted: false,
      mode: "live",
      error: "Live TradersPost routing is intentionally gated for v1.",
    },
    { status: 503 },
  );
}
