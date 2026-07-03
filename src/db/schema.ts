import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { FibAnchor, WorkspaceState } from "@/lib/domain";

export const fibDrawings = pgTable(
  "fib_drawings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    family: text("family").notNull(),
    timeframe: text("timeframe").notNull(),
    direction: text("direction").notNull(),
    start: jsonb("start").$type<FibAnchor>().notNull(),
    end: jsonb("end").$type<FibAnchor>().notNull(),
    visible: boolean("visible").notNull().default(true),
    locked: boolean("locked").notNull().default(false),
    manual: boolean("manual").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("fib_direction_per_timeframe").on(
      table.userId,
      table.family,
      table.timeframe,
      table.direction,
    ),
  ],
);

export const workspacePreferences = pgTable("workspace_preferences", {
  userId: text("user_id").primaryKey(),
  state: jsonb("state").$type<WorkspaceState>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Prop-firm → Tradovate links. One row per (user, firm). The Tradovate
 * password is stored AES-256-GCM encrypted (see src/lib/crypto.ts) so the
 * connection survives sessions/devices until it is explicitly disconnected.
 */
export const accountConnections = pgTable("account_connections", {
  id: text("id").primaryKey(), // `${userId}:${firm}`
  userId: text("user_id").notNull(),
  firm: text("firm").notNull(),
  username: text("username").notNull(),
  secret: text("secret").notNull(), // encrypted Tradovate password
  environment: text("environment").notNull(), // "live" | "demo"
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Orders the admin has submitted — the viewer's live "Open Trades" source. */
export const trades = pgTable("trades", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  family: text("family").notNull(), // NQ | YM | GC
  symbol: text("symbol").notNull(), // display symbol, e.g. NQ1!
  contract: text("contract").notNull(), // actual contract, e.g. NQU6 (or root in paper mode)
  side: text("side").notNull(), // "long" | "short"
  quantity: integer("quantity").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  takeProfit: doublePrecision("take_profit"),
  stopLoss: doublePrecision("stop_loss"),
  mode: text("mode").notNull(), // "paper" | "demo" | "live"
  status: text("status").notNull().default("open"), // "open" | "closed"
  providerOrderId: text("provider_order_id"),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});
