import type { Environment } from "@/lib/connections";

/**
 * Minimal Tradovate REST client (server-side only).
 *
 * Authentication exchanges the account's Tradovate username/password plus the
 * app's API key pair (cid/sec, from Tradovate API Access) for a short-lived
 * Bearer token via /v1/auth/accesstokenrequest on the demo or live host.
 * Tokens are cached in-memory per user+environment and renewed ahead of
 * expiry. Order placement uses /v1/order/placeorder (plain) or
 * /v1/order/placeoso (entry + offset TP/SL brackets).
 */

const HOSTS: Record<Environment, string> = {
  live: "https://live.tradovateapi.com/v1",
  demo: "https://demo.tradovateapi.com/v1",
};

export type TradovateAuthSuccess = {
  ok: true;
  accessToken: string;
  expirationTime: string;
  userId: number;
  name: string;
};

export type TradovateAuthFailure = {
  ok: false;
  /** Human-readable reason safe to show in the UI. */
  error: string;
  /** True when the credentials were REJECTED (vs. config/transport trouble). */
  rejected: boolean;
};

export type TradovateAuthResult = TradovateAuthSuccess | TradovateAuthFailure;

export function isTradovateConfigured() {
  return Boolean(process.env.TRADOVATE_CID && process.env.TRADOVATE_SEC);
}

function appCredentials() {
  return {
    appId: process.env.TRADOVATE_APP_ID ?? "Voltis",
    appVersion: "1.0.0",
    cid: Number(process.env.TRADOVATE_CID),
    sec: process.env.TRADOVATE_SEC ?? "",
    deviceId: process.env.TRADOVATE_DEVICE_ID ?? "voltis-server",
  };
}

export async function authenticateTradovate(input: {
  username: string;
  password: string;
  environment: Environment;
}): Promise<TradovateAuthResult> {
  if (!isTradovateConfigured()) {
    return {
      ok: false,
      rejected: false,
      error:
        "Tradovate API access is not configured on the server (TRADOVATE_CID / TRADOVATE_SEC)",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${HOSTS[input.environment]}/auth/accesstokenrequest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.username,
        password: input.password,
        ...appCredentials(),
      }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      rejected: false,
      error: "Could not reach Tradovate — please try again",
    };
  }

  const body = (await response.json().catch(() => ({}))) as {
    accessToken?: string;
    expirationTime?: string;
    userId?: number;
    name?: string;
    errorText?: string;
    "p-ticket"?: string;
    "p-time"?: number;
    "p-captcha"?: boolean;
  };

  if (body["p-ticket"]) {
    // Too many attempts: Tradovate imposes a time penalty (and possibly a
    // captcha, which a server cannot solve). Surface the wait to the user.
    const wait = body["p-time"] ?? 60;
    return {
      ok: false,
      rejected: false,
      error: body["p-captcha"]
        ? "Tradovate requires a captcha after too many attempts — sign in at tradovate.com once, then retry here"
        : `Tradovate is rate-limiting sign-ins — wait ${wait}s and try again`,
    };
  }

  if (!response.ok || !body.accessToken) {
    return {
      ok: false,
      rejected: true,
      error: body.errorText
        ? `Tradovate rejected these credentials: ${body.errorText}`
        : "Tradovate rejected these credentials",
    };
  }

  return {
    ok: true,
    accessToken: body.accessToken,
    expirationTime: body.expirationTime ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: body.userId ?? 0,
    name: body.name ?? input.username,
  };
}

/* ------------------------------ token cache ------------------------------ */

type CachedToken = { accessToken: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

export async function tradovateToken(input: {
  cacheKey: string;
  username: string;
  password: string;
  environment: Environment;
}): Promise<TradovateAuthResult> {
  const cached = tokenCache.get(input.cacheKey);
  // Renew 5 minutes ahead of expiry.
  if (cached && cached.expiresAt - 5 * 60 * 1000 > Date.now()) {
    return {
      ok: true,
      accessToken: cached.accessToken,
      expirationTime: new Date(cached.expiresAt).toISOString(),
      userId: 0,
      name: input.username,
    };
  }

  const auth = await authenticateTradovate(input);
  if (auth.ok) {
    tokenCache.set(input.cacheKey, {
      accessToken: auth.accessToken,
      expiresAt: new Date(auth.expirationTime).getTime(),
    });
  }
  return auth;
}

export function dropTradovateToken(cacheKey: string) {
  tokenCache.delete(cacheKey);
}

/* ------------------------------- REST calls ------------------------------ */

async function tradovateGet<T>(
  environment: Environment,
  accessToken: string,
  path: string,
): Promise<T | null> {
  try {
    const response = await fetch(`${HOSTS[environment]}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type TradovateAccount = {
  id: number;
  name: string;
  active: boolean;
  accountType?: string;
};

export async function listTradovateAccounts(
  environment: Environment,
  accessToken: string,
): Promise<TradovateAccount[]> {
  const accounts = await tradovateGet<TradovateAccount[]>(
    environment,
    accessToken,
    "/account/list",
  );
  return (accounts ?? []).filter((account) => account.active !== false);
}

type SuggestedContract = { id: number; name: string };

/**
 * Resolve the tradable front contract for a root like "NQ" or "MNQ" — e.g.
 * "NQU6". Tradovate's suggest endpoint returns tradable contracts for the
 * text; the first hit whose name starts with the root is the front month.
 */
export async function resolveFrontContract(
  environment: Environment,
  accessToken: string,
  root: string,
): Promise<string | null> {
  const suggestions = await tradovateGet<SuggestedContract[]>(
    environment,
    accessToken,
    `/contract/suggest?t=${encodeURIComponent(root)}&l=10`,
  );
  const match = (suggestions ?? []).find(
    (contract) =>
      contract.name.startsWith(root) &&
      /^[FGHJKMNQUVXZ]\d{1,2}$/.test(contract.name.slice(root.length)),
  );
  return match?.name ?? null;
}

export type PlacedOrder =
  | { ok: true; orderId: number }
  | { ok: false; error: string };

/**
 * Place a market order, optionally wrapped with take-profit / stop-loss
 * brackets (OSO with offset brackets relative to the fill).
 */
export async function placeTradovateOrder(input: {
  environment: Environment;
  accessToken: string;
  accountId: number;
  accountSpec: string;
  action: "Buy" | "Sell";
  symbol: string;
  quantity: number;
  /** Offsets from the fill, in PRICE POINTS (already tick-scaled). */
  takeProfitOffset?: number | null;
  stopLossOffset?: number | null;
}): Promise<PlacedOrder> {
  const base = {
    accountSpec: input.accountSpec,
    accountId: input.accountId,
    action: input.action,
    symbol: input.symbol,
    orderQty: input.quantity,
    orderType: "Market",
    isAutomated: false,
  };

  const sign = input.action === "Buy" ? 1 : -1;
  const brackets: object[] = [];
  if (input.takeProfitOffset && input.takeProfitOffset > 0) {
    brackets.push({
      action: input.action === "Buy" ? "Sell" : "Buy",
      orderType: "Limit",
      isOffset: true,
      offset: sign * input.takeProfitOffset,
    });
  }
  if (input.stopLossOffset && input.stopLossOffset > 0) {
    brackets.push({
      action: input.action === "Buy" ? "Sell" : "Buy",
      orderType: "Stop",
      isOffset: true,
      offset: -sign * input.stopLossOffset,
    });
  }

  const path = brackets.length > 0 ? "/order/placeoso" : "/order/placeorder";
  const payload =
    brackets.length > 0
      ? { ...base, bracket1: brackets[0], ...(brackets[1] ? { bracket2: brackets[1] } : {}) }
      : base;

  let response: Response;
  try {
    response = await fetch(`${HOSTS[input.environment]}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach Tradovate to place the order" };
  }

  const body = (await response.json().catch(() => ({}))) as {
    orderId?: number;
    failureReason?: string;
    failureText?: string;
  };

  if (!response.ok || body.failureReason || !body.orderId) {
    return {
      ok: false,
      error:
        body.failureText ??
        body.failureReason ??
        `Tradovate did not accept the order (HTTP ${response.status})`,
    };
  }
  return { ok: true, orderId: body.orderId };
}

export type TradovatePosition = {
  accountId: number;
  contractId: number;
  netPos: number;
};

export async function listTradovatePositions(
  environment: Environment,
  accessToken: string,
): Promise<TradovatePosition[] | null> {
  return tradovateGet<TradovatePosition[]>(
    environment,
    accessToken,
    "/position/list",
  );
}
