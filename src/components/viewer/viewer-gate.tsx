"use client";

import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Password gate for the public viewer. Verified visitors receive a signed
 * 30-day cookie, so the password is a one-time step per device.
 */
export function ViewerGate() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/viewer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        unlocked?: boolean;
        error?: string;
      };
      if (!response.ok || !body.unlocked) {
        setError(body.error ?? "Unable to unlock the viewer");
        setSubmitting(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <main
      data-theme="light"
      className="vw grid h-dvh place-items-center overflow-hidden"
    >
      <div className="w-[360px]">
        <button
          onClick={() => window.location.assign("/")}
          aria-label="Voltis home"
          className="mb-6 block text-[21px] font-semibold tracking-[-0.04em] transition-opacity hover:opacity-70"
        >
          Voltis
        </button>

        <div className="rounded-xl border border-line bg-card p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card-soft text-ink">
              <Lock size={15} />
            </span>
            <div>
              <h1 className="text-[15px] font-semibold tracking-[-0.02em]">
                Viewer access
              </h1>
              <p className="text-[10px] text-ink-2">
                This page is for verified viewers only.
              </p>
            </div>
          </div>

          <form onSubmit={unlock} className="mt-5">
            <label className="block text-[10px] font-medium text-ink-2">
              Viewer password
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-card-soft px-3">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
                className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? "Hide password" : "Show password"}
                className="text-ink-2 hover:text-ink"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error ? (
              <p role="alert" className="mt-2.5 text-[10px] text-down">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "v-press mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-chip text-[11px] font-semibold text-chip-ink",
                submitting && "opacity-60",
              )}
            >
              {submitting ? "Unlocking…" : "View live positions"}
              {!submitting ? <ArrowRight size={13} /> : null}
            </button>
          </form>

          <p className="mt-4 text-[9px] leading-4 text-ink-3">
            Access stays active on this device for 30 days. Ask Yazan for the
            password if you don&apos;t have it.
          </p>
        </div>
      </div>
    </main>
  );
}
