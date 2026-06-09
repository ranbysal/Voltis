import {
  DEFAULT_WORKSPACE,
  type WorkspaceState,
} from "@/lib/domain";

const STORAGE_KEY = "voltis.workspace.v2";

export function hasSavedWorkspace() {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(STORAGE_KEY) !== null
  );
}

export function loadWorkspace(): WorkspaceState {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE;
  }

  const value = window.localStorage.getItem(STORAGE_KEY);
  if (!value) {
    return DEFAULT_WORKSPACE;
  }

  try {
    return {
      ...DEFAULT_WORKSPACE,
      ...(JSON.parse(value) as Partial<WorkspaceState>),
    };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

export function saveWorkspace(state: WorkspaceState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export async function loadCloudWorkspace(): Promise<WorkspaceState | null> {
  try {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      state?: WorkspaceState | null;
    };
    return body.state ?? null;
  } catch {
    return null;
  }
}

export async function saveCloudWorkspace(state: WorkspaceState) {
  try {
    await fetch("/api/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // Local persistence remains the offline fallback.
  }
}
