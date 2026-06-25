import { redirect } from "next/navigation";
import { TradingWorkspace } from "@/components/trading-workspace";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await currentSession();
  if (!session) {
    redirect("/login");
  }

  return <TradingWorkspace />;
}
