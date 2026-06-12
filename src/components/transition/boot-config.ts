/**
 * Landing -> dashboard "boot/decrypt" transition configuration.
 *
 * Every duration in the choreography is authored against the faithful
 * 5-second take; BOOT_TOTAL_S is the single dial that retimes the whole
 * sequence (GSAP timelines run at timeScale BOOT_TIME_SCALE, RAF-based
 * pieces divide their milliseconds through ms()).
 */
export const BOOT_PRESETS = {
  faithful: 5,
  fast: 2.8,
} as const;

export type BootPreset = keyof typeof BOOT_PRESETS;

/** Switch to "fast" to compress the whole transition to ~2.8s. */
export const BOOT_PRESET: BootPreset = "faithful";

/** The one duration constant that tunes the entire transition. */
export const BOOT_TOTAL_S: number = BOOT_PRESETS[BOOT_PRESET];

/** GSAP timelines speed up by this factor; RAF durations divide by it. */
export const BOOT_TIME_SCALE = 5 / BOOT_TOTAL_S;

/** Scale an authored millisecond value to the active preset. */
export const ms = (authoredMs: number) => authoredMs / BOOT_TIME_SCALE;

/** Session flag handed from the landing exit to the dashboard boot. */
export const BOOT_FLAG = "voltis-boot";

/** Glyph pool for the scramble decode effect. */
export const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Easing used for frame draw + container entrances. */
export const BOOT_EASE = [0.22, 1, 0.36, 1] as const;

export type BootPhase =
  | "idle"
  | "containers"
  | "tickers"
  | "stats"
  | "buy"
  | "done";

const PHASE_RANK: Record<BootPhase, number> = {
  idle: 0,
  containers: 1,
  tickers: 2,
  stats: 3,
  buy: 4,
  done: 5,
};

export const phaseAtLeast = (phase: BootPhase, target: BootPhase) =>
  PHASE_RANK[phase] >= PHASE_RANK[target];
