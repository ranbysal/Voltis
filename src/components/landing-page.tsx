"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

const NAME = "Yazan";

/**
 * Line-drawn portrait. Every path uses pathLength=1 so the draw-on
 * animation can run on a normalized dash offset, staggered per stroke.
 */
function PortraitSketch() {
  const strokes: { d: string; delay: number; width?: number }[] = [
    // jaw + face outline
    {
      d: "M156 96 C150 120 146 152 152 178 C157 202 168 224 186 236 C202 246 222 246 238 234 C254 222 264 200 268 178",
      delay: 0.1,
    },
    // hair top
    {
      d: "M152 110 C148 70 172 38 210 34 C248 30 276 56 280 92 C281 104 280 116 276 126",
      delay: 0.35,
    },
    // hair inner sweep
    {
      d: "M160 98 C170 72 192 56 218 56 C244 56 264 72 272 96",
      delay: 0.5,
    },
    // left ear
    {
      d: "M150 160 C142 154 138 160 142 170 C145 178 152 182 156 178",
      delay: 0.62,
    },
    // right brow
    { d: "M230 130 C240 124 254 124 262 130", delay: 0.74 },
    // left brow
    { d: "M178 132 C186 126 198 126 206 131", delay: 0.74 },
    // right eye
    { d: "M236 144 C242 140 252 140 257 145", delay: 0.86 },
    { d: "M238 147 C243 150 250 150 255 147", delay: 0.9 },
    // left eye
    { d: "M183 146 C188 142 197 142 202 146", delay: 0.86 },
    { d: "M185 149 C190 152 196 152 201 149", delay: 0.9 },
    // nose
    { d: "M218 148 C217 162 215 172 210 180 C214 184 222 185 227 182", delay: 1.0 },
    // smile
    { d: "M196 200 C208 210 230 210 242 198", delay: 1.12 },
    { d: "M200 204 C210 211 228 211 238 202", delay: 1.18 },
    // moustache
    { d: "M198 192 C212 188 228 188 240 191", delay: 1.1 },
    // beard outline
    {
      d: "M152 176 C154 204 164 228 184 242 C202 254 226 254 242 242 C260 230 268 206 270 182",
      delay: 1.22,
      width: 1.6,
    },
    // beard hatching
    { d: "M170 210 L166 222", delay: 1.34 },
    { d: "M182 224 L178 236", delay: 1.38 },
    { d: "M198 234 L196 246", delay: 1.42 },
    { d: "M216 238 L216 250", delay: 1.46 },
    { d: "M234 232 L238 244", delay: 1.5 },
    { d: "M250 220 L256 230", delay: 1.54 },
    // neck
    { d: "M186 244 C188 258 188 268 184 278", delay: 1.6 },
    { d: "M240 240 C240 254 242 264 248 274", delay: 1.6 },
    // shoulders + crew neck
    {
      d: "M84 388 C96 330 134 292 182 280 C194 290 216 292 232 284 C242 280 248 278 252 276 C304 286 344 326 356 388",
      delay: 1.72,
      width: 1.8,
    },
    // collar
    { d: "M182 280 C194 300 234 302 252 276", delay: 1.9 },
    // shirt fold hints
    { d: "M150 340 C146 356 144 372 144 388", delay: 2.0 },
    { d: "M292 338 C296 354 298 372 298 388", delay: 2.0 },
  ];

  return (
    <svg
      viewBox="0 0 440 390"
      fill="none"
      aria-hidden="true"
      className="v-draw h-full w-auto"
    >
      {strokes.map((stroke, index) => (
        <path
          key={index}
          d={stroke.d}
          pathLength={1}
          stroke="#1c1d1b"
          strokeWidth={stroke.width ?? 1.4}
          strokeLinecap="round"
          style={{ animationDelay: `${stroke.delay}s` }}
        />
      ))}
    </svg>
  );
}

export function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    router.prefetch("/workspace");
  }, [router]);

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    for (const letter of letterRefs.current) {
      if (!letter) {
        continue;
      }
      const rect = letter.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const distance = Math.hypot(dx, dy);
      const radius = 260;
      if (distance > radius) {
        letter.style.setProperty("transform", "translate(0px, 0px)");
        continue;
      }
      const force = (1 - distance / radius) ** 2;
      const push = 34 * force;
      const angle = Math.atan2(dy, dx);
      const tx = -Math.cos(angle) * push;
      const ty = -Math.sin(angle) * push;
      const tilt = (dx > 0 ? -1 : 1) * 7 * force;
      letter.style.setProperty(
        "transform",
        `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`,
      );
    }
  }

  function handleMouseLeave() {
    for (const letter of letterRefs.current) {
      letter?.style.setProperty("transform", "translate(0px, 0px)");
    }
  }

  function leaveTo(path: string) {
    if (leaving) {
      return;
    }
    setLeaving(true);
    try {
      window.sessionStorage.setItem("voltis-wipe", "1");
    } catch {
      // ignore storage failures; the transition simply skips the reveal
    }
    window.setTimeout(() => router.push(path), 760);
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-[#eae9e7] text-[#161714]">
      <header className="v-fade-up flex items-center justify-between px-8 pt-7 sm:px-12">
        <span className="select-none text-[15px] font-medium tracking-[0.42em] text-[#1c1d1b]">
          VOLTIS
        </span>
        <nav className="flex items-center gap-8 text-[13px] text-[#33342f]">
          <button
            onClick={() => leaveTo("/workspace")}
            className="v-press rounded-md px-1 py-0.5 hover:text-black"
          >
            Viewer
          </button>
          <button
            onClick={() => leaveTo("/workspace")}
            className="v-press rounded-md px-1 py-0.5 hover:text-black"
          >
            Login
          </button>
        </nav>
      </header>

      <div
        ref={heroRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative flex min-h-0 flex-1 flex-col items-center"
      >
        <h1
          className="relative z-10 mt-[4vh] select-none whitespace-nowrap text-center italic leading-none tracking-[-0.02em]"
          style={{
            fontFamily:
              "var(--font-serif), Playfair Display, Georgia, serif",
            fontSize: "clamp(7rem, 24vw, 21rem)",
          }}
          aria-label={NAME}
        >
          {NAME.split("").map((char, index) => (
            <span
              key={index}
              ref={(node) => {
                letterRefs.current[index] = node;
              }}
              className="v-letter"
              style={{ animationDelay: `${0.12 + index * 0.07}s` }}
              aria-hidden="true"
            >
              {char}
            </span>
          ))}
        </h1>

        <div className="pointer-events-none relative z-0 -mt-[9vh] flex min-h-0 flex-1 justify-center">
          <PortraitSketch />
        </div>
      </div>

      <div className="v-wipe" data-state={leaving ? "enter" : undefined}>
        <span
          className={
            leaving
              ? "v-wipe-word text-[13px] font-medium tracking-[0.42em]"
              : "opacity-0"
          }
        >
          VOLTIS
        </span>
      </div>
    </main>
  );
}
