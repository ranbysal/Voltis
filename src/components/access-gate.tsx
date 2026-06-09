"use client";

import { LockKeyhole, Zap } from "lucide-react";
import { useState } from "react";

export function AccessGate({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = (await response.json()) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      setError(result.error ?? "Unable to sign in");
      return;
    }

    window.location.reload();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#050609] px-6 text-[#f3f5f7]">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0a0d12] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#20c6c9] text-[#041011]">
            <Zap size={19} strokeWidth={2.8} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-[-0.03em]">
              VOLTIS
            </h1>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#687282]">
              Private futures workspace
            </p>
          </div>
        </div>

        {configured ? (
          <form onSubmit={signIn} className="mt-8">
            <label
              htmlFor="access-password"
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#737d8b]"
            >
              Access password
            </label>
            <div className="mt-2 flex items-center rounded-lg border border-white/[0.09] bg-[#07090d] px-3 focus-within:border-[#2acdd0]/40">
              <LockKeyhole size={14} className="text-[#596270]" />
              <input
                id="access-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[#3f4753]"
                placeholder="Enter Yazan's access password"
              />
            </div>
            {error ? (
              <p className="mt-2 text-[10px] text-[#ff7089]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting || password.length === 0}
              className="mt-4 h-11 w-full rounded-lg bg-[#20c6c9] text-[11px] font-semibold text-[#041011] transition hover:bg-[#3ad4d6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "VERIFYING..." : "OPEN WORKSPACE"}
            </button>
          </form>
        ) : (
          <div className="mt-7 rounded-lg border border-[#e0ad54]/20 bg-[#e0ad54]/[0.07] p-4">
            <p className="text-[11px] font-medium text-[#e4bd72]">
              Authentication requires configuration
            </p>
            <p className="mt-1.5 text-[10px] leading-5 text-[#8f826b]">
              Set `VOLTIS_ACCESS_PASSWORD` and a 32+ character
              `VOLTIS_SESSION_SECRET` before deploying.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

