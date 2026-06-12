"use client";

import { useEffect, useRef } from "react";
import { SCRAMBLE_GLYPHS } from "./boot-config";

const randomGlyph = () =>
  SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];

/**
 * Decode/corrupt text effect driven by a single RAF loop.
 *
 * decodeOut: every character cycles random A-Z/0-9 glyphs (starting
 * left -> right with `charStaggerMs`) while the word truncates from the
 * trailing end (`truncStaggerMs` apart), e.g. YAZAN -> YAZ4N -> YA5X ->
 * Y2 -> nothing.
 *
 * decodeIn: characters start as random glyphs and resolve to the real
 * text left -> right.
 *
 * Until `play` flips true the real text renders statically, so the
 * component can permanently own the hero/nav strings without changing
 * their appearance.
 */
export function ScrambleText({
  text,
  mode = "decodeOut",
  play,
  charStaggerMs = 40,
  cycleMs = 70,
  cyclesPerChar = 6,
  truncStaggerMs = 60,
  holdMs = 420,
  className,
  onComplete,
}: {
  text: string;
  mode?: "decodeOut" | "decodeIn";
  play: boolean;
  /** Per-character corruption start stagger (left to right). */
  charStaggerMs?: number;
  /** Interval between random glyph swaps. */
  cycleMs?: number;
  /** Glyph swaps before a character resolves (decodeIn). */
  cyclesPerChar?: number;
  /** Trailing-end truncation stagger (decodeOut). */
  truncStaggerMs?: number;
  /** Corruption time before the first character drops (decodeOut). */
  holdMs?: number;
  className?: string;
  onComplete?: () => void;
}) {
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const chars = text.split("");

  useEffect(() => {
    if (!play || doneRef.current) {
      return;
    }
    doneRef.current = true;
    const n = chars.length;
    const start = performance.now();
    const lastSwap = new Array<number>(n).fill(0);

    const tick = (now: number) => {
      const t = now - start;
      let finished = true;

      for (let i = 0; i < n; i++) {
        const el = spanRefs.current[i];
        if (!el) {
          continue;
        }
        if (mode === "decodeOut") {
          const corruptAt = i * charStaggerMs;
          const dropAt = holdMs + (n - 1 - i) * truncStaggerMs;
          if (t >= dropAt) {
            if (el.textContent !== "") {
              el.textContent = "";
            }
          } else {
            finished = false;
            if (t >= corruptAt && now - lastSwap[i] >= cycleMs) {
              lastSwap[i] = now;
              el.textContent = randomGlyph();
            }
          }
        } else {
          const resolveAt = i * charStaggerMs + cyclesPerChar * cycleMs;
          if (t >= resolveAt) {
            if (el.textContent !== chars[i]) {
              el.textContent = chars[i];
            }
          } else {
            finished = false;
            if (now - lastSwap[i] >= cycleMs) {
              lastSwap[i] = now;
              el.textContent = randomGlyph();
            }
          }
        }
      }

      if (finished) {
        onComplete?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <span className={className} aria-hidden="true">
      {chars.map((char, index) => (
        <span
          key={index}
          ref={(node) => {
            spanRefs.current[index] = node;
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
