import { z } from "zod";
import {
  createViewerToken,
  isViewerGateEnabled,
  viewerCookie,
  viewerPasswordMatches,
} from "@/lib/auth";

const unlockSchema = z.object({
  password: z.string().min(1).max(256),
});

/** Unlock the viewer with the shared viewer password (30-day cookie). */
export async function POST(request: Request) {
  if (!isViewerGateEnabled()) {
    return Response.json({ unlocked: true, gate: "disabled" });
  }

  const body = await request.json().catch(() => null);
  const parsed = unlockSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { unlocked: false, error: "Enter the viewer password" },
      { status: 400 },
    );
  }

  if (!viewerPasswordMatches(parsed.data.password)) {
    return Response.json(
      { unlocked: false, error: "Incorrect password" },
      { status: 401 },
    );
  }

  const token = createViewerToken();
  if (!token) {
    return Response.json(
      { unlocked: false, error: "Access signing is unavailable" },
      { status: 503 },
    );
  }

  const cookie = viewerCookie(token);
  const response = Response.json({ unlocked: true });
  response.headers.append(
    "Set-Cookie",
    `${cookie.name}=${token}; Max-Age=${cookie.maxAge}; Path=/; HttpOnly; SameSite=Strict${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return response;
}
