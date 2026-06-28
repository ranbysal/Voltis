"use client";

import gsap from "gsap";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BootFrame } from "@/components/transition/boot-frame";
import { BackgroundTexture } from "./background-texture";
import { HeroPortrait } from "./hero-portrait";
import { HeroTypography } from "./hero-typography";
import { IntroGrid } from "./intro-grid";
import { Navbar } from "./navbar";
import { CANVAS_H, CANVAS_W, u } from "./units";

export function LandingPage() {
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const [scrambling] = useState(false);

  useEffect(() => {
    router.prefetch("/login");
    router.prefetch("/viewer");
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
          onViewer={() => router.push("/viewer")}
          onLogin={() => router.push("/login")}
          scrambling={scrambling}
        />
      </div>

      <BootFrame id="v-bootframe" />
      <IntroGrid />
    </main>
  );
}
