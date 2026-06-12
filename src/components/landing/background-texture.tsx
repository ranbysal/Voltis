import Image from "next/image";

/** Full-bleed paper texture behind every other layer. */
export function BackgroundTexture() {
  return (
    <div id="v-texture" aria-hidden className="absolute inset-0 z-0">
      <Image
        src="/texture.png"
        alt=""
        fill
        priority
        unoptimized
        sizes="100vw"
        className="object-cover"
        draggable={false}
      />
    </div>
  );
}
