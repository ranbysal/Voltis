CREATE TABLE "account_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"firm" text NOT NULL,
	"username" text NOT NULL,
	"secret" text NOT NULL,
	"environment" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family" text NOT NULL,
	"symbol" text NOT NULL,
	"contract" text NOT NULL,
	"side" text NOT NULL,
	"quantity" integer NOT NULL,
	"entry_price" double precision NOT NULL,
	"take_profit" double precision,
	"stop_loss" double precision,
	"mode" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider_order_id" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
