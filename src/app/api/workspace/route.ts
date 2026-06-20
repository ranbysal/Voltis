import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspacePreferences } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { TIMEFRAMES } from "@/lib/domain";
import { getDatabase } from "@/lib/db";

const anchorSchema = z.object({
  time: z.number().int(),
  price: z.number().positive(),
});

const fibSchema = z.object({
  id: z.string().min(1),
  family: z.enum(["YM", "NQ", "GC"]),
  timeframe: z.enum(TIMEFRAMES),
  direction: z.enum(["buy", "sell"]),
  start: anchorSchema,
  end: anchorSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  manual: z.boolean(),
  updatedAt: z.iso.datetime(),
});

const workspaceSchema = z.object({
  family: z.enum(["YM", "NQ", "GC"]),
  executionSize: z.enum(["mini", "micro"]),
  timeframe: z.enum(TIMEFRAMES),
  fibs: z.array(fibSchema).max(36),
  quantity: z.number().int().positive().max(100),
  stopLoss: z.number().nonnegative().max(10_000),
  takeProfit: z.number().nonnegative().max(10_000),
});

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = getDatabase();
  if (!database) {
    return Response.json({ state: null, persistence: "local" });
  }

  const [workspace] = await database
    .select()
    .from(workspacePreferences)
    .where(eq(workspacePreferences.userId, session.userId))
    .limit(1);

  return Response.json({
    state: workspace?.state ?? null,
    persistence: "neon",
  });
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ saved: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const state = workspaceSchema.safeParse(body);
  if (!state.success) {
    return Response.json(
      { saved: false, error: "Invalid workspace state" },
      { status: 400 },
    );
  }

  const database = getDatabase();
  if (!database) {
    return Response.json({ saved: false, persistence: "local" });
  }

  const userId = session.userId;
  await database
    .insert(workspacePreferences)
    .values({ userId, state: state.data })
    .onConflictDoUpdate({
      target: workspacePreferences.userId,
      set: { state: state.data, updatedAt: new Date() },
    });

  return Response.json({ saved: true, persistence: "neon" });
}
