import { requireSession } from "@/lib/auth";
import {
  createMarketStreamToken,
  isMarketStreamConfigured,
} from "@/lib/market-stream";

export async function POST() {
  // The live candle stream is public market data: signed-in admins get a
  // token under their own id, anonymous visitors (the /viewer page) get a
  // shared "viewer" identity. The HMAC gate still keeps arbitrary third-party
  // clients out unless they came through this endpoint.
  const session = await requireSession();
  if (!isMarketStreamConfigured()) {
    return Response.json(
      { error: "Live market gateway is not configured" },
      { status: 503 },
    );
  }

  const token = createMarketStreamToken(session?.userId ?? "viewer");
  if (!token) {
    return Response.json(
      { error: "Live market gateway is not configured" },
      { status: 503 },
    );
  }

  return Response.json({
    token,
    url: process.env.MARKET_GATEWAY_URL,
  });
}
