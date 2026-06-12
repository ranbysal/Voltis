import { u } from "./units";

/**
 * Cinematic fog hugging the bottom of the viewport: a vertical gradient
 * base plus large blurred plumes that GSAP drifts horizontally forever.
 */
export function FogOverlay() {
  return (
    <div
      id="v-fog"
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 overflow-hidden"
      style={{ height: u(430) }}
    >
      <div className="v-fog-base" />
      <div
        className="v-fog-plume"
        style={{ left: "4%", bottom: u(-170), width: u(880), height: u(400) }}
      />
      <div
        className="v-fog-plume"
        style={{ left: "32%", bottom: u(-190), width: u(1060), height: u(450) }}
      />
      <div
        className="v-fog-plume"
        style={{ right: "1%", bottom: u(-160), width: u(840), height: u(390) }}
      />
      <div
        className="v-fog-plume"
        style={{
          left: "20%",
          bottom: u(30),
          width: u(700),
          height: u(250),
          opacity: 0.5,
        }}
      />
    </div>
  );
}
