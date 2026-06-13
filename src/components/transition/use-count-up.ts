"use client";

import { useEffect, useRef, useState } from "react";

const format = (value: number, decimals: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Tweens 0 -> value with locale formatting once `play` flips true.
 * When `play` is false the final value renders immediately, so callers
 * can use it unconditionally outside the boot sequence.
 *
 * The animation is driven entirely by a RAF loop that advances a 0..1
 * `progress` value; the displayed number is derived from the live `value`
 * prop during render, so live updates keep flowing when not playing without
 * any setState-in-effect.
 */
export function useCountUp(
  value: number,
  {
    play,
    durationMs,
    decimals = 2,
    onDone,
  }: {
    play: boolean;
    durationMs: number;
    decimals?: number;
    onDone?: () => void;
  },
) {
  const [progress, setProgress] = useState(play ? 0 : 1);
  const [prevPlay, setPrevPlay] = useState(play);
  const onDoneRef = useRef(onDone);

  // Reset the tween whenever `play` toggles (the React-sanctioned
  // "adjust state during render" pattern — no effect, so no cascade).
  if (play !== prevPlay) {
    setPrevPlay(play);
    setProgress(play ? 0 : 1);
  }

  // Keep the latest completion callback for the RAF closure to read.
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!play) {
      return;
    }
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        onDoneRef.current?.();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [play, durationMs]);

  const eased = 1 - (1 - progress) ** 3;
  const text = format(play ? value * eased : value, decimals);
  const done = !play || progress >= 1;

  return { text, done };
}
