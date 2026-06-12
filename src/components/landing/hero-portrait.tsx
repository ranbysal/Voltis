import Image from "next/image";

/**
 * The portrait cutout. The asset shares the 1672 x 941 reference canvas,
 * so filling the stage reproduces the reference placement exactly.
 */
export function HeroPortrait() {
  return (
    <div id="v-portrait" className="pointer-events-none absolute inset-0 z-10">
      <Image
        src="/hero-portrait.png"
        alt="Portrait of Yazan"
        fill
        priority
        unoptimized
        sizes="100vw"
        className="object-contain"
        draggable={false}
      />
    </div>
  );
}
