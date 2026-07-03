import { eq } from "drizzle-orm";
import { z } from "zod";
import { accountConnections } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { FIRM_IDS, type Environment } from "@/lib/connections";
import { decryptSecret, encryptSecret, isSecretStoreConfigured } from "@/lib/crypto";
import { ensureTradingSchema, getDatabase } from "@/lib/db";
import {
  authenticateTradovate,
  dropTradovateToken,
  isTradovateConfigured,
  listTradovateAccounts,
} from "@/lib/tradovate";

const connectSchema = z.object({
  firm: z.enum(FIRM_IDS),
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
  environment: z.enum(["live", "demo"]),
});

const firmSchema = z.object({ firm: z.enum(FIRM_IDS) });

function rowId(userId: string, firm: string) {
  return `${userId}:${firm}`;
}

/** List the user's persisted connections (no secrets ever leave the server). */
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = getDatabase();
  if (!database || !(await ensureTradingSchema())) {
    return Response.json({ connections: [], persistence: "local" });
  }

  const rows = await database
    .select({
      firm: accountConnections.firm,
      username: accountConnections.username,
      environment: accountConnections.environment,
      connectedAt: accountConnections.connectedAt,
      lastSyncAt: accountConnections.lastSyncAt,
    })
    .from(accountConnections)
    .where(eq(accountConnections.userId, session.userId));

  return Response.json({
    persistence: "neon",
    connections: rows.map((row) => ({
      firm: row.firm,
      username: row.username,
      environment: row.environment as Environment,
      connectedAt: row.connectedAt.toISOString(),
      lastSync: row.lastSyncAt.toISOString(),
    })),
  });
}

/**
 * Connect a firm: the Tradovate credentials are validated against Tradovate's
 * real auth API — invalid/fake accounts are rejected — then stored encrypted
 * so the connection persists until it is explicitly disconnected.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json(
      { connected: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { connected: false, error: "Enter your Tradovate username and password" },
      { status: 400 },
    );
  }

  if (!isTradovateConfigured()) {
    return Response.json(
      {
        connected: false,
        error:
          "Tradovate API access is not configured on the server yet — add TRADOVATE_CID and TRADOVATE_SEC",
      },
      { status: 503 },
    );
  }

  const { firm, username, password, environment } = parsed.data;
  const auth = await authenticateTradovate({ username, password, environment });
  if (!auth.ok) {
    return Response.json(
      { connected: false, error: auth.error },
      { status: auth.rejected ? 401 : 503 },
    );
  }

  // Real account confirmed. Persist the link (encrypted) so it survives
  // sessions and devices until manually disconnected.
  const accounts = await listTradovateAccounts(environment, auth.accessToken);
  const now = new Date();
  const database = getDatabase();
  let persisted = false;

  if (database && (await ensureTradingSchema()) && isSecretStoreConfigured()) {
    const secret = encryptSecret(password);
    if (secret) {
      await database
        .insert(accountConnections)
        .values({
          id: rowId(session.userId, firm),
          userId: session.userId,
          firm,
          username,
          secret,
          environment,
          connectedAt: now,
          lastSyncAt: now,
        })
        .onConflictDoUpdate({
          target: accountConnections.id,
          set: {
            username,
            secret,
            environment,
            connectedAt: now,
            lastSyncAt: now,
          },
        });
      persisted = true;
    }
  }

  return Response.json({
    connected: true,
    firm,
    username,
    environment,
    persisted,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
    })),
    lastSync: now.toISOString(),
  });
}

/** Re-validate a stored connection and refresh its sync time. */
export async function PATCH(request: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ synced: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = firmSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ synced: false, error: "Unknown firm" }, { status: 400 });
  }

  const database = getDatabase();
  if (!database || !(await ensureTradingSchema())) {
    // No server store: report a local-only sync so the UI can still update.
    return Response.json({ synced: true, persistence: "local", lastSync: new Date().toISOString() });
  }

  const [row] = await database
    .select()
    .from(accountConnections)
    .where(eq(accountConnections.id, rowId(session.userId, parsed.data.firm)))
    .limit(1);
  if (!row) {
    return Response.json(
      { synced: false, error: "This firm is not connected" },
      { status: 404 },
    );
  }

  const password = decryptSecret(row.secret);
  if (!password) {
    return Response.json(
      { synced: false, error: "Stored credentials could not be read — reconnect the account" },
      { status: 500 },
    );
  }

  const auth = await authenticateTradovate({
    username: row.username,
    password,
    environment: row.environment as Environment,
  });
  if (!auth.ok) {
    return Response.json({ synced: false, error: auth.error }, { status: 502 });
  }

  const now = new Date();
  await database
    .update(accountConnections)
    .set({ lastSyncAt: now })
    .where(eq(accountConnections.id, row.id));

  return Response.json({ synced: true, lastSync: now.toISOString() });
}

/** Disconnect: remove the stored link (and any cached token). */
export async function DELETE(request: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json(
      { disconnected: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = firmSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { disconnected: false, error: "Unknown firm" },
      { status: 400 },
    );
  }

  const database = getDatabase();
  if (database && (await ensureTradingSchema())) {
    await database
      .delete(accountConnections)
      .where(
        eq(accountConnections.id, rowId(session.userId, parsed.data.firm)),
      );
  }
  dropTradovateToken(rowId(session.userId, parsed.data.firm));

  return Response.json({ disconnected: true, firm: parsed.data.firm });
}
