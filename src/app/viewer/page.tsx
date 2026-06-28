import type { Metadata } from "next";
import { ViewerWorkspace } from "@/components/viewer/viewer-workspace";

export const metadata: Metadata = {
  title: "Voltis | Viewer",
  description: "Watch Yazan's live futures positions in real time.",
};

// Public, read-only view of the admin's open trades — no sign-in required.
export default function ViewerPage() {
  return <ViewerWorkspace />;
}
