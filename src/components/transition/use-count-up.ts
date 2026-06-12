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
  const [text, setText] = useState(() => format(play ? 0 : value, decimals));
  const [done, setDone] = useState(!play);
  const startedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!play || startedRef.current) {
      return;
    }
    startedRef.current = true;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      setText(format(valueRef.current * eased, decimals));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
        onDoneRef.current?.();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, durationMs, decimals]);

  // outside the boot path keep tracking live values
  useEffect(() => {
    if (done && !play) {
      setText(format(value, decimals));
    }
  }, [value, decimals, done, play]);

  return { text, done };
}
