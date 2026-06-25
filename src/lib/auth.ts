import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "voltis_session";
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const REMEMBER_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

// Development-only fallbacks. They keep the full sign-in flow working out of the
// box (no env file required) while remaining trivially overridable in
// production via the documented VOLTIS_* variables. None of these are ever used
// when NODE_ENV === "production": there, the real env values are mandatory.
const DEV_SESSION_SECRET =
  "voltis-development-insecure-session-secret-change-me";
const DEFAULT_ADMIN_EMAIL = "yazan@voltis.trade";
const DEV_ADMIN_PASSWORD = "voltis";

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/** A signing secret of at least 32 chars, or undefined when unavailable. */
function sessionSecret() {
  const configured = process.env.VOLTIS_SESSION_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (!isProduction()) {
    return DEV_SESSION_SECRET;
  }
  return undefined;
}

/** The single administrator email Yazan signs in with. */
export function adminEmail() {
  return (process.env.VOLTIS_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
}

/** The administrator password. Falls back to the legacy access password. */
function adminPassword() {
  const configured =
    process.env.VOLTIS_ADMIN_PASSWORD ?? process.env.VOLTIS_ACCESS_PASSWORD;
  if (configured) {
    return configured;
  }
  if (!isProduction()) {
    return DEV_ADMIN_PASSWORD;
  }
  return undefined;
}

export function isAuthConfigured() {
  return Boolean(adminPassword() && sessionSecret());
}

export function isDevelopmentBypass() {
  return process.env.NODE_ENV === "development" && !isAuthConfigured();
}

function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) {
    return null;
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(userId: string, remember = false) {
  const lifetime = remember
    ? REMEMBER_LIFETIME_SECONDS
    : SESSION_LIFETIME_SECONDS;
  const payload: SessionPayload = {
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + lifetime,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return signature ? `${encoded}.${signature}` : null;
}

export function verifySessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  const expected = sign(encoded);
  if (!encoded || !signature || !expected) {
    return null;
  }

  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      typeof payload.userId !== "string" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function currentSession() {
  if (isDevelopmentBypass()) {
    return {
      userId: process.env.VOLTIS_USER_ID ?? "yazan",
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
  }

  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await currentSession();
  if (!session) {
    return null;
  }
  return session;
}

export function sessionCookie(token: string, remember = false) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: remember ? REMEMBER_LIFETIME_SECONDS : SESSION_LIFETIME_SECONDS,
  };
}

export function expiredSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
  };
}

export function passwordMatches(input: string) {
  const configured = adminPassword();
  if (!configured) {
    return false;
  }

  const inputBuffer = Buffer.from(input);
  const configuredBuffer = Buffer.from(configured);
  return (
    inputBuffer.length === configuredBuffer.length &&
    timingSafeEqual(inputBuffer, configuredBuffer)
  );
}

export function emailMatches(input: string) {
  return input.trim().toLowerCase() === adminEmail();
}
