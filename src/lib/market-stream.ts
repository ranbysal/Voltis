import { createHmac, timingSafeEqual } from "node:crypto";

const STREAM_TOKEN_LIFETIME_SECONDS = 90;

export type MarketStreamTokenPayload = {
  userId: string;
  expiresAt: number;
};

function streamSecret() {
  return process.env.MARKET_GATEWAY_SECRET;
}

function sign(value: string) {
  const secret = streamSecret();
  if (!secret || secret.length < 32) {
    return null;
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function isMarketStreamConfigured() {
  return Boolean(
    process.env.MARKET_GATEWAY_URL && sign("configuration-check"),
  );
}

export function createMarketStreamToken(userId: string) {
  const payload: MarketStreamTokenPayload = {
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + STREAM_TOKEN_LIFETIME_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return signature ? `${encoded}.${signature}` : null;
}

export function verifyMarketStreamToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  const expected = encoded ? sign(encoded) : null;
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
    ) as MarketStreamTokenPayload;
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
