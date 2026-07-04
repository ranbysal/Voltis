import type { Metadata } from "next";
import { ViewerGate } from "@/components/viewer/viewer-gate";
import { ViewerWorkspace } from "@/components/viewer/viewer-workspace";
import { hasViewerAccess } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Voltis | Viewer",
  description: "Watch Yazan's live futures positions in real time.",
};

// The gate depends on request cookies and runtime env, so the page must be
// rendered per-request — never prerendered at build time (a static build
// would bake in whichever gate state existed during the build).
export const dynamic = "force-dynamic";

// Read-only view of the admin's open trades. With VOLTIS_VIEWER_PASSWORD set,
// visitors verify once per device (30-day cookie); admins pass automatically.
// Without it the page stays public.
export default async function ViewerPage() {
  if (!(await hasViewerAccess())) {
    return <ViewerGate />;
  }
  return <ViewerWorkspace />;
}
