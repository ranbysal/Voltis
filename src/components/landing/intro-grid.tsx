/**
 * Page-load cover: a flat dark surface divided into large rectangular
 * blocks by hairline grid lines. GSAP slides the blocks out of frame
 * (sides exit horizontally, the middle columns exit vertically).
 */
const BLOCKS = Array.from({ length: 8 }, (_, i) => i);

export function IntroGrid() {
  return (
    <div
      id="v-intro"
      aria-hidden
      className="fixed inset-0 z-[100] grid grid-cols-4 grid-rows-2"
    >
      {BLOCKS.map((i) => (
        <div
          key={i}
          data-intro-block
          className="bg-[#111312] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.06)] will-change-transform"
        />
      ))}
    </div>
  );
}
