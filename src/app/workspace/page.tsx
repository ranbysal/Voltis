import { AccessGate } from "@/components/access-gate";
import { TradingWorkspace } from "@/components/trading-workspace";
import { currentSession, isAuthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Runs before paint: when the landing hand-off flag is present the boot
 * choreography owns the first frame, so the dashboard regions must be
 * hidden before hydration to avoid any flash of the assembled UI.
 */
const BOOT_PREPAINT = `try{if(sessionStorage.getItem("voltis-boot")){var r=matchMedia("(prefers-reduced-motion: reduce)").matches;document.documentElement.setAttribute(r?"data-vboot-reduced":"data-vboot","1")}}catch(e){}`;

export default async function WorkspacePage() {
  const session = await currentSession();

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOT_PREPAINT }} />
      {session ? <TradingWorkspace /> : <AccessGate configured={isAuthConfigured()} />}
    </>
  );
}
