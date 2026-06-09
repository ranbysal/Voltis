import { expiredSessionCookie } from "@/lib/auth";

export async function POST() {
  const cookie = expiredSessionCookie();
  const response = Response.json({ authenticated: false });
  response.headers.append(
    "Set-Cookie",
    `${cookie.name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}

