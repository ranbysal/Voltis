import { requireSession } from "@/lib/auth";
import {
  createMarketStreamToken,
  isMarketStreamConfigured,
} from "@/lib/market-stream";

export async function POST() {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isMarketStreamConfigured()) {
    return Response.json(
      { error: "Live market gateway is not configured" },
      { status: 503 },
    );
  }

  const token = createMarketStreamToken(session.userId);
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
