"use client";

import { ArrowRight, Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BackgroundTexture } from "@/components/landing/background-texture";
import { HeroPortrait } from "@/components/landing/hero-portrait";
import { CANVAS_H, CANVAS_W, u } from "@/components/landing/units";
import { BOOT_FLAG } from "@/components/transition/boot-config";

/**
 * The sign-in surface. It reproduces the 1672 x 941 reference composition: the
 * landing backdrop (paper + portrait + "YAZAN") with a sign-in card pinned to
 * the right. Every measurement is expressed through `u()` so the card stays
 * pixel-aligned to the artwork at any viewport size, exactly like the landing.
 */
export function LoginScreen() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // No boot choreography runs here; clear any stale hand-off flag so a later
  // visit to the dashboard isn't mistaken for a landing transition.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(BOOT_FLAG);
    } catch {
      // sessionStorage unavailable; nothing to clear
    }
    document.documentElement.removeAttribute("data-vboot");
    document.documentElement.removeAttribute("data-vboot-reduced");
    router.prefetch("/workspace");
  }, [router]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Unable to sign in");
        setSubmitting(false);
        return;
      }

      // Full navigation so the server re-reads the freshly set session cookie.
      window.location.assign("/workspace");
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <main className="v-auth fixed inset-0 overflow-hidden bg-[#e4e0df] text-[#161714]">
      <BackgroundTexture />

      {/* Stage: the 1672 x 941 reference canvas, scaled to fit. */}
      <div
        className="relative z-10 mx-auto"
        style={{ width: u(CANVAS_W), height: u(CANVAS_H) }}
      >
        {/* Oversized "YAZAN" watermark sitting behind the portrait. */}
        <span
          aria-hidden="true"
          className="v-serif pointer-events-none absolute left-0 select-none whitespace-nowrap leading-none text-[#cbc8c4]"
          style={{
            top: u(296),
            fontSize: u(244),
            letterSpacing: u(34),
            paddingLeft: u(58),
          }}
        >
          YAZAN
        </span>

        <HeroPortrait />

        {/* Header */}
        <header className="absolute inset-x-0 top-0 z-40">
          <button
            type="button"
            aria-label="Voltis home"
            onClick={() => router.push("/")}
            className="v-serif absolute select-none text-[#1f1f21] transition-opacity hover:opacity-70"
            style={{
              left: u(44),
              top: u(34),
              fontSize: u(30),
              letterSpacing: "0.2em",
              lineHeight: 1.1,
            }}
          >
            VOLTIS
          </button>
          <nav
            className="v-serif absolute flex items-baseline text-[#2c2c2e]"
            style={{ right: u(46), top: u(40), gap: u(42) }}
          >
            <button
              type="button"
              onClick={() => router.push("/workspace")}
              className="transition-colors duration-200 hover:text-black"
              style={{ fontSize: u(21), letterSpacing: "0.01em" }}
            >
              Viewer
            </button>
            <button
              type="button"
              onClick={() => emailRef.current?.focus()}
              className="text-black transition-colors duration-200"
              style={{ fontSize: u(21), letterSpacing: "0.01em" }}
            >
              Login
            </button>
          </nav>
        </header>

        {/* Sign-in card */}
        <section
          className="v-fade-up absolute z-30 rounded-[var(--r)] border border-[#d8d5d2] bg-[#e8e5e3]/85 backdrop-blur-[1px]"
          style={
            {
              right: u(112),
              top: u(132),
              width: u(512),
              padding: `${u(48)} ${u(52)} ${u(44)}`,
              "--r": u(26),
              boxShadow: `0 ${u(40)} ${u(90)} rgba(40,38,36,0.16)`,
            } as React.CSSProperties
          }
        >
          <h1
            className="v-serif leading-none text-[#1a1a1c]"
            style={{ fontSize: u(54), letterSpacing: "-0.01em" }}
          >
            Login
          </h1>

          <form onSubmit={signIn} style={{ marginTop: u(30) }} noValidate>
            <FieldLabel>Email</FieldLabel>
            <Field>
              <Mail
                style={{ width: u(17), height: u(17) }}
                className="shrink-0 text-[#8a8d86]"
              />
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="min-w-0 flex-1 bg-transparent text-[#1a1a1c] outline-none placeholder:text-[#a8a5a2]"
                style={{ fontSize: u(15) }}
              />
            </Field>

            <div style={{ height: u(20) }} />

            <FieldLabel>Password</FieldLabel>
            <Field>
              <Lock
                style={{ width: u(17), height: u(17) }}
                className="shrink-0 text-[#8a8d86]"
              />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="min-w-0 flex-1 bg-transparent text-[#1a1a1c] outline-none placeholder:text-[#a8a5a2]"
                style={{ fontSize: u(15) }}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
                className="shrink-0 text-[#8a8d86] transition-colors hover:text-[#4a4a4a]"
              >
                {showPassword ? (
                  <EyeOff style={{ width: u(17), height: u(17) }} />
                ) : (
                  <Eye style={{ width: u(17), height: u(17) }} />
                )}
              </button>
            </Field>

            <div className="flex justify-end" style={{ marginTop: u(14) }}>
              <button
                type="button"
                onClick={() => setHint((current) => !current)}
                className="text-[#6f726c] transition-colors hover:text-black"
                style={{ fontSize: u(13) }}
              >
                Forgot password?
              </button>
            </div>

            {hint ? (
              <p
                className="text-[#6f726c]"
                style={{ fontSize: u(11.5), marginTop: u(8), lineHeight: 1.5 }}
              >
                Access is managed for you. Contact your administrator to reset
                the Voltis password.
              </p>
            ) : null}

            <button
              type="button"
              role="checkbox"
              aria-checked={remember}
              onClick={() => setRemember((current) => !current)}
              className="flex items-center"
              style={{ marginTop: u(20), gap: u(11) }}
            >
              <span
                className="grid place-items-center rounded-[var(--cr)] border transition-colors"
                style={
                  {
                    width: u(19),
                    height: u(19),
                    "--cr": u(5),
                    borderColor: remember ? "#1a1a1c" : "#cdcac7",
                    background: remember ? "#1a1a1c" : "#efedeb",
                  } as React.CSSProperties
                }
              >
                {remember ? (
                  <Check
                    style={{ width: u(12), height: u(12) }}
                    className="text-white"
                  />
                ) : null}
              </span>
              <span className="text-[#3a3a3a]" style={{ fontSize: u(14) }}>
                Remember me
              </span>
            </button>

            {error ? (
              <p
                role="alert"
                className="text-[#c2453f]"
                style={{ fontSize: u(12.5), marginTop: u(14) }}
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="v-press relative w-full rounded-[var(--br)] bg-[#141414] font-semibold text-white transition-colors hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-60"
              style={
                {
                  marginTop: error ? u(16) : u(28),
                  height: u(56),
                  fontSize: u(15),
                  letterSpacing: "0.01em",
                  "--br": u(13),
                } as React.CSSProperties
              }
            >
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting ? (
                <ArrowRight
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ right: u(22), width: u(18), height: u(18) }}
                />
              ) : null}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block font-semibold text-[#2c2c2c]"
      style={{ fontSize: u(13), marginBottom: u(10) }}
    >
      {children}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center rounded-[var(--fr)] border border-[#d6d3d0] bg-[#efedeb] transition-colors focus-within:border-[#1a1a1c]"
      style={
        {
          height: u(54),
          gap: u(12),
          paddingLeft: u(16),
          paddingRight: u(16),
          "--fr": u(11),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
