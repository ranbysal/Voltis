"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  BOOT_FLAG,
  BOOT_TIME_SCALE,
} from "@/components/transition/boot-config";
import { BootFrame } from "@/components/transition/boot-frame";
import { BackgroundTexture } from "./background-texture";
import { HeroPortrait } from "./hero-portrait";
import { HeroTypography } from "./hero-typography";
import { IntroGrid } from "./intro-grid";
import { Navbar } from "./navbar";
import { CANVAS_H, CANVAS_W, u } from "./units";

gsap.registerPlugin(CustomEase);
const frameEase = CustomEase.create("v-frame", "0.22,1,0.36,1");

export function LandingPage() {
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const leavingRef = useRef(false);
  const [scrambling, setScrambling] = useState(false);

  useEffect(() => {
    router.prefetch("/workspace");
    router.prefetch("/login");
  }, [router]);

  /* ----- page-load reveal (grid blocks / hero scale / masked nav) ----- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const ctx = gsap.context(() => {
      gsap.set("#v-bootframe", { autoAlpha: 0 });

      if (reduceMotion) {
        gsap.set("#v-intro", { display: "none" });
        return;
      }

      const blocks = gsap.utils.toArray<HTMLElement>("[data-intro-block]");
      const navItems = gsap.utils.toArray<HTMLElement>("[data-nav-item]");

      gsap.set("#v-hero", {
        scale: 1.1,
        autoAlpha: 0,
        transformOrigin: "50% 50%",
      });
      gsap.set(navItems, { yPercent: 100 });

      const tl = gsap.timeline();

      // Phase 1 (0.0s - 1.0s): cover blocks slide out of frame.
      tl.to(
        blocks,
        {
          xPercent: (i: number) =>
            i % 4 === 0 ? -102 : i % 4 === 3 ? 102 : 0,
          yPercent: (i: number) =>
            i % 4 === 1 || i % 4 === 2 ? (i < 4 ? -102 : 102) : 0,
          duration: 0.85,
          ease: "power4.inOut",
          stagger: { each: 0.04, from: "random" },
        },
        0,
      );
      tl.set("#v-intro", { display: "none" });

      // Phase 2 (0.5s - 1.5s): portrait + YAZAN scale 110% -> 100%.
      tl.to(
        "#v-hero",
        { scale: 1, autoAlpha: 1, duration: 1.0, ease: "power3.out" },
        0.5,
      );

      // Phase 3 (1.0s - 1.8s): masked slide-up of VOLTIS / Viewer / Login.
      tl.to(
        navItems,
        { yPercent: 0, duration: 0.8, ease: "power4.out", stagger: 0.12 },
        1.0,
      );

    }, root);

    return () => ctx.revert();
  }, []);

  /**
   * startTransition(): the single CTA entry point. Runs Beat 1 (scramble-
   * dissolve) and Beats 2-3 (registration marks + frame draw) on one master
   * timeline, then hands off to the dashboard which mounts behind the
   * already-drawn frame and assembles panel-by-panel (Beat 4).
   */
  function startBootTransition() {
    if (leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    const root = rootRef.current;

    try {
      window.sessionStorage.setItem(BOOT_FLAG, "1");
    } catch {
      // sessionStorage unavailable; the dashboard simply loads plain
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || !root) {
      // 250ms crossfade instead of the full choreography. The dashboard mounts
      // via a client-side route change, so the pre-paint script never runs —
      // set the reduced-motion flag here so the dashboard fades in assembled.
      document.documentElement.setAttribute("data-vboot-reduced", "1");
      gsap.to(root ?? "main", {
        autoAlpha: 0,
        duration: 0.25,
        ease: "power1.in",
        onComplete: () => router.push("/workspace"),
      });
      return;
    }

    // Hide the dashboard before it mounts. router.push is a client-side nav, so
    // the workspace pre-paint script does not execute; setting data-vboot on the
    // shared document carries the "hidden until boot" state across the handoff.
    document.documentElement.setAttribute("data-vboot", "1");

    // Beat 1: text decode-scramble (RAF-driven, same preset clock)
    setScrambling(true);

    const tl = gsap.timeline({
      onComplete: () => router.push("/workspace"),
    });
    tl.timeScale(BOOT_TIME_SCALE);

    tl.set(root, { pointerEvents: "none" }, 0);

    // Beat 1: the page disintegrates forward (fade + slight scale + blur)
    tl.to(
      "#v-portrait",
      {
        autoAlpha: 0,
        scale: 1.04,
        filter: "blur(6px)",
        duration: 0.8,
        ease: "power2.in",
        transformOrigin: "50% 30%",
      },
      0.15,
    );
    tl.to(
      "#v-texture",
      { autoAlpha: 0, duration: 0.9, ease: "power1.in" },
      0.3,
    );
    // safety fade as the last scrambled glyphs drop out
    tl.to(
      "#v-hero h1",
      { autoAlpha: 0, duration: 0.25, ease: "power1.in" },
      1.05,
    );

    // Beats 2-3 prep: frame container on, but marks/strokes hidden
    tl.set("#v-bootframe [data-boot-mark]", { opacity: 0 }, 0);
    tl.set(
      "#v-bootframe [data-frame-seg], #v-bootframe [data-frame-bracket]",
      { strokeDasharray: 1, strokeDashoffset: 1 },
      0,
    );
    tl.set("#v-bootframe [data-boot-status]", { autoAlpha: 0 }, 0);
    tl.set("#v-bootframe", { autoAlpha: 1 }, 0.1);

    // Beat 2 (overlaps end of Beat 1): registration marks blink in
    tl.to(
      "#v-bootframe [data-boot-mark]",
      { opacity: 1, duration: 0.05, ease: "steps(1)", stagger: 0.05 },
      1.15,
    );

    // Beat 3: corner brackets, then edge strokes extend to meet
    tl.to(
      "#v-bootframe [data-frame-bracket]",
      { strokeDashoffset: 0, duration: 0.2, ease: frameEase, stagger: 0.04 },
      1.6,
    );
    tl.to(
      "#v-bootframe [data-frame-seg]",
      { strokeDashoffset: 0, duration: 0.5, ease: frameEase, stagger: 0.025 },
      1.72,
    );

    // small settle hold before the route hand-off
    tl.set({}, {}, 2.35);
  }

  return (
    <main
      ref={rootRef}
      className="v-landing fixed inset-0 overflow-hidden bg-[#e4e0df] text-[#161714]"
    >
      <BackgroundTexture />

      {/* Stage: the 1672 x 941 reference canvas, scaled to fit. */}
      <div
        className="relative z-10 mx-auto"
        style={{ width: u(CANVAS_W), height: u(CANVAS_H) }}
      >
        <div id="v-hero" className="absolute inset-0">
          <HeroTypography scrambling={scrambling} />
          <HeroPortrait />
        </div>
        <Navbar
          onHome={() => router.push("/")}
          onViewer={startBootTransition}
          onLogin={() => router.push("/login")}
          scrambling={scrambling}
        />
      </div>

      <BootFrame id="v-bootframe" />
      <IntroGrid />
    </main>
  );
}
