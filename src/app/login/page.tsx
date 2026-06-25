import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/login-screen";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the form and go straight to the dashboard.
  const session = await currentSession();
  if (session) {
    redirect("/workspace");
  }

  return <LoginScreen />;
}
