/**
 * Prop-firm account connections.
 *
 * Each firm Yazan trades through is wired to the same Tradovate login, so a
 * "connection" records which firm is linked, the (non-secret) Tradovate
 * username, the environment, and sync timestamps. The Tradovate password is
 * only ever sent to the server over HTTPS during the connect request — it is
 * never written to localStorage. UI state persists locally (and survives
 * reloads) so the workspace keeps working with or without a database, matching
 * how the rest of the app degrades gracefully.
 */

import { nanoid } from "nanoid";

export const PROP_FIRMS = [
  { id: "topstep", name: "Topstep", monogram: "T" },
  { id: "alphafutures", name: "Alpha Futures", monogram: "A" },
  { id: "takeprofittrader", name: "TakeProfitTrader", monogram: "TP" },
  { id: "lucid", name: "Lucid", monogram: "star" },
] as const;

export type PropFirm = (typeof PROP_FIRMS)[number];
export type FirmId = PropFirm["id"];

export const FIRM_IDS = PROP_FIRMS.map((firm) => firm.id) as [
  FirmId,
  ...FirmId[],
];

export const FIRM_NAMES: Record<FirmId, string> = PROP_FIRMS.reduce(
  (accumulator, firm) => {
    accumulator[firm.id] = firm.name;
    return accumulator;
  },
  {} as Record<FirmId, string>,
);

export type Environment = "live" | "demo";

export type ConnectionRecord = {
  status: "connected" | "disconnected";
  username: string;
  environment: Environment;
  connectedAt: string | null;
  lastSync: string | null;
};

export type ConnectionState = Record<FirmId, ConnectionRecord>;

function blankConnection(): ConnectionRecord {
  return {
    status: "disconnected",
    username: "",
    environment: "live",
    connectedAt: null,
    lastSync: null,
  };
}

/**
 * Initial state. TakeProfitTrader ships pre-linked (1 / 4 active) so the
 * settings page reflects the reference on first visit; the rest are Yazan's to
 * connect. Timestamps stay null here (deterministic — safe for SSR) and are
 * seeded with a real client-side time on first mount.
 */
export function defaultConnections(): ConnectionState {
  return {
    topstep: blankConnection(),
    alphafutures: blankConnection(),
    takeprofittrader: {
      status: "connected",
      username: "",
      environment: "live",
      connectedAt: null,
      lastSync: null,
    },
    lucid: blankConnection(),
  };
}

const CONNECTIONS_KEY = "voltis.connections.v1";

export function loadConnections(): ConnectionState {
  const base = defaultConnections();
  if (typeof window === "undefined") {
    return base;
  }
  const raw = window.localStorage.getItem(CONNECTIONS_KEY);
  if (!raw) {
    return base;
  }
  try {
    const saved = JSON.parse(raw) as Partial<ConnectionState>;
    const merged = { ...base };
    for (const id of FIRM_IDS) {
      if (saved[id]) {
        merged[id] = { ...base[id], ...saved[id] } as ConnectionRecord;
      }
    }
    return merged;
  } catch {
    return base;
  }
}

export function saveConnections(state: ConnectionState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(state));
  }
}

export function activeCount(state: ConnectionState) {
  return FIRM_IDS.filter((id) => state[id].status === "connected").length;
}

export function latestSync(state: ConnectionState): string | null {
  return FIRM_IDS.map((id) => state[id].lastSync)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

/* --------------------------- activity log ---------------------------- */

export type ActivityKind =
  | "connect"
  | "disconnect"
  | "sync"
  | "signin";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  firm: FirmId | null;
  label: string;
  at: string;
};

const ACTIVITY_KEY = "voltis.activity.v1";
const ACTIVITY_LIMIT = 40;

export function loadActivity(): ActivityEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(ACTIVITY_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveActivity(entries: ActivityEntry[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      ACTIVITY_KEY,
      JSON.stringify(entries.slice(0, ACTIVITY_LIMIT)),
    );
  }
}

export function appendActivity(
  entries: ActivityEntry[],
  entry: Omit<ActivityEntry, "id" | "at"> & { at?: string },
): ActivityEntry[] {
  const next: ActivityEntry = {
    id: nanoid(),
    at: entry.at ?? new Date().toISOString(),
    kind: entry.kind,
    firm: entry.firm,
    label: entry.label,
  };
  return [next, ...entries].slice(0, ACTIVITY_LIMIT);
}

/* --------------------------- server connect -------------------------- */

export type ConnectResult =
  | { ok: true; lastSync: string }
  | { ok: false; error: string };

export async function requestConnect(payload: {
  firm: FirmId;
  username: string;
  password: string;
  environment: Environment;
}): Promise<ConnectResult> {
  try {
    const response = await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as {
      lastSync?: string;
      error?: string;
    };
    if (!response.ok) {
      return { ok: false, error: body.error ?? "Unable to connect account" };
    }
    return { ok: true, lastSync: body.lastSync ?? new Date().toISOString() };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}
