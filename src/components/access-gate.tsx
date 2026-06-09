"use client";

import { LockKeyhole } from "lucide-react";
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
    <main className="grid min-h-dvh place-items-center bg-[#d6d6d3] px-6 text-[#151515]">
      <div className="w-full max-w-sm rounded-2xl border border-[#dededa] bg-[#fbfbfa] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10">
            <span className="absolute left-1 top-2 h-6 w-8 rotate-45 rounded-full border-2 border-black" />
            <span className="absolute left-1 top-2 h-6 w-8 -rotate-45 rounded-full border-2 border-black" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-[-0.03em]">
              VOLTIS
            </h1>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#818489]">
              Private futures workspace
            </p>
          </div>
        </div>

        {configured ? (
          <form onSubmit={signIn} className="mt-8">
            <label
              htmlFor="access-password"
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#73777c]"
            >
              Access password
            </label>
            <div className="mt-2 flex items-center rounded-lg border border-[#dededa] bg-white px-3 focus-within:border-[#111]">
              <LockKeyhole size={14} className="text-[#777b80]" />
              <input
                id="access-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[#aaa]"
                placeholder="Enter Yazan's access password"
              />
            </div>
            {error ? (
              <p className="mt-2 text-[10px] text-[#c94852]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting || password.length === 0}
              className="mt-4 h-11 w-full rounded-lg bg-black text-[11px] font-semibold text-white transition hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "VERIFYING..." : "OPEN WORKSPACE"}
            </button>
          </form>
        ) : (
          <div className="mt-7 rounded-lg border border-[#dededa] bg-[#f3f3f1] p-4">
            <p className="text-[11px] font-medium text-[#333]">
              Authentication requires configuration
            </p>
            <p className="mt-1.5 text-[10px] leading-5 text-[#777]">
              Set `VOLTIS_ACCESS_PASSWORD` and a 32+ character
              `VOLTIS_SESSION_SECRET` before deploying.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

