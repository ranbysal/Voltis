import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { FIRM_IDS } from "@/lib/connections";

const connectSchema = z.object({
  firm: z.enum(FIRM_IDS),
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
  environment: z.enum(["live", "demo"]),
});

/**
 * Link a prop-firm account to its Tradovate login.
 *
 * The credentials arrive over HTTPS and are validated here. Live order routing
 * stays intentionally disabled until Yazan's prop-firm permissions and account
 * identifiers are verified (see README), so this endpoint acknowledges the link
 * and returns a sync timestamp without persisting the password anywhere. In a
 * production deployment this is the seam that hands the credentials to the
 * trading backend.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json(
      { connected: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { connected: false, error: "Enter your Tradovate username and password" },
      { status: 400 },
    );
  }

  const { firm, username, environment } = parsed.data;
  // Note: parsed.data.password is deliberately not logged or stored.
  return Response.json({
    connected: true,
    firm,
    username,
    environment,
    lastSync: new Date().toISOString(),
  });
}
