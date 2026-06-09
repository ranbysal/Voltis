import { z } from "zod";
import {
  createSessionToken,
  isAuthConfigured,
  passwordMatches,
  sessionCookie,
} from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json(
      { authenticated: false, error: "Authentication is not configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const credentials = loginSchema.safeParse(body);
  if (!credentials.success || !passwordMatches(credentials.data.password)) {
    return Response.json(
      { authenticated: false, error: "Invalid access password" },
      { status: 401 },
    );
  }

  const token = createSessionToken(process.env.VOLTIS_USER_ID ?? "yazan");
  if (!token) {
    return Response.json(
      { authenticated: false, error: "Session signing is unavailable" },
      { status: 503 },
    );
  }

  const response = Response.json({ authenticated: true });
  response.headers.append(
    "Set-Cookie",
    `${sessionCookie(token).name}=${token}; Max-Age=${sessionCookie(token).maxAge}; Path=/; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}

