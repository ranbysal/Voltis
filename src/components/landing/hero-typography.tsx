import { ms } from "@/components/transition/boot-config";
import { ScrambleText } from "@/components/transition/scramble-text";
import { u } from "./units";

/**
 * The massive serif "YAZAN" that sits behind the portrait.
 * Reference geometry: ink spans x 129-1542, cap-height 220px with the
 * baseline at y 546 on the 1672 x 941 canvas (PP Editorial New Italic:
 * cap 220 at 271px, pen origin at x 154.4 for an ink-left of 129).
 *
 * During the boot transition the word decode-scrambles apart
 * (YAZAN -> YAZ4N -> YA5X -> Y2 -> nothing).
 */
export function HeroTypography({ scrambling }: { scrambling: boolean }) {
  return (
    <h1
      aria-label="YAZAN"
      className="v-hero-serif absolute left-0 w-full select-none whitespace-nowrap text-left leading-none text-[#1e1e20]"
      style={{
        top: u(332),
        fontSize: u(271),
        letterSpacing: u(128.2),
        paddingLeft: u(154.4),
      }}
    >
      <ScrambleText
        text="YAZAN"
        mode="decodeOut"
        play={scrambling}
        charStaggerMs={ms(40)}
        cycleMs={ms(65)}
        holdMs={ms(520)}
        truncStaggerMs={ms(120)}
      />
    </h1>
  );
}
