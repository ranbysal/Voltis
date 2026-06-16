import { ms } from "@/components/transition/boot-config";
import { ScrambleText } from "@/components/transition/scramble-text";
import { u } from "./units";

/**
 * Top navigation. Reference geometry (1672 x 941 canvas):
 * VOLTIS at x 33 with ~31px caps; "Viewer" / "Login" right-aligned with
 * a 46px inset and ~19px caps. Every item sits inside an overflow-hidden
 * mask so the load timeline can push it up from below, and each label
 * scramble-corrupts away during the boot transition.
 */
export function Navbar({
  onNavigate,
  scrambling,
}: {
  onNavigate: (path: string) => void;
  scrambling: boolean;
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="v-mask absolute" style={{ left: u(18), top: u(19) }}>
        <span
          data-nav-item
          aria-label="VOLTIS"
          className="block select-none font-medium text-[#1f1f21]"
          style={{ fontSize: u(44), letterSpacing: "0.18em", lineHeight: 1.1 }}
        >
          <ScrambleText
            text="VOLTIS"
            mode="decodeOut"
            play={scrambling}
            charStaggerMs={ms(30)}
            cycleMs={ms(55)}
            holdMs={ms(300)}
            truncStaggerMs={ms(60)}
          />
        </span>
      </div>
      <nav
        className="absolute flex items-baseline text-[#2c2c2e]"
        style={{ right: u(28), top: u(28), gap: u(46) }}
      >
        <div className="v-mask">
          <button
            data-nav-item
            aria-label="Viewer"
            onClick={() => onNavigate("/workspace")}
            className="transition-colors duration-200 hover:text-black"
            style={{ fontSize: u(22), letterSpacing: "0.02em", lineHeight: 1.2 }}
          >
            <span className="v-condensed" style={{ transformOrigin: "100% 50%" }}>
              <ScrambleText
                text="Viewer"
                mode="decodeOut"
                play={scrambling}
                charStaggerMs={ms(28)}
                cycleMs={ms(50)}
                holdMs={ms(260)}
                truncStaggerMs={ms(55)}
              />
            </span>
          </button>
        </div>
        <div className="v-mask">
          <button
            data-nav-item
            aria-label="Login"
            onClick={() => onNavigate("/workspace")}
            className="transition-colors duration-200 hover:text-black"
            style={{ fontSize: u(22), letterSpacing: "0.02em", lineHeight: 1.2 }}
          >
            <span className="v-condensed" style={{ transformOrigin: "100% 50%" }}>
              <ScrambleText
                text="Login"
                mode="decodeOut"
                play={scrambling}
                charStaggerMs={ms(28)}
                cycleMs={ms(50)}
                holdMs={ms(260)}
                truncStaggerMs={ms(55)}
              />
            </span>
          </button>
        </div>
      </nav>
    </header>
  );
}
