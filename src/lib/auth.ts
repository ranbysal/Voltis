import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "voltis_session";
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

function sessionSecret() {
  return process.env.VOLTIS_SESSION_SECRET;
}

export function isAuthConfigured() {
  return Boolean(
    process.env.VOLTIS_ACCESS_PASSWORD &&
      sessionSecret() &&
      sessionSecret()!.length >= 32,
  );
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

export function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
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

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  };
}

export function expiredSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
  };
}

export function passwordMatches(input: string) {
  const configured = process.env.VOLTIS_ACCESS_PASSWORD;
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

