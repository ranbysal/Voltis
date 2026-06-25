import { z } from "zod";
import {
  createSessionToken,
  emailMatches,
  isAuthConfigured,
  passwordMatches,
  sessionCookie,
} from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().email().max(256),
  password: z.string().min(1).max(256),
  remember: z.boolean().optional(),
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
  if (!credentials.success) {
    return Response.json(
      { authenticated: false, error: "Enter a valid email and password" },
      { status: 400 },
    );
  }

  const { email, password, remember } = credentials.data;
  // Validate both factors before responding so the error is identical whether
  // the email, the password, or both are wrong.
  if (!emailMatches(email) || !passwordMatches(password)) {
    return Response.json(
      { authenticated: false, error: "Incorrect email or password" },
      { status: 401 },
    );
  }

  const token = createSessionToken(
    process.env.VOLTIS_USER_ID ?? "yazan",
    remember ?? false,
  );
  if (!token) {
    return Response.json(
      { authenticated: false, error: "Session signing is unavailable" },
      { status: 503 },
    );
  }

  const cookie = sessionCookie(token, remember ?? false);
  const response = Response.json({ authenticated: true });
  response.headers.append(
    "Set-Cookie",
    `${cookie.name}=${token}; Max-Age=${cookie.maxAge}; Path=/; HttpOnly; SameSite=Strict${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return response;
}
