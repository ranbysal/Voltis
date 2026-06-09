import { AccessGate } from "@/components/access-gate";
import { TradingWorkspace } from "@/components/trading-workspace";
import {
  currentSession,
  isAuthConfigured,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session) {
    return <AccessGate configured={isAuthConfigured()} />;
  }

  return <TradingWorkspace />;
}
