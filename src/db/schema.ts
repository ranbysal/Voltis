import {
  boolean,
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
