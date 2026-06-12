/**
 * The landing page is a 1:1 reproduction of a 1672 x 941 reference canvas.
 * `--s` (set on .v-landing) is the scale of one reference pixel, so every
 * measurement taken from the reference maps through this helper.
 */
export const u = (referencePx: number) => `calc(var(--s) * ${referencePx})`;

export const CANVAS_W = 1672;
export const CANVAS_H = 941;
