// Shared "all clear" relaxation assets — calm imagery + gentle quotes used as
// positive empty-state / win-feeling nudges. Mirrors the desktop Pulse window's
// RELAX_IMAGES / RELAX_QUOTES (kept here so mobile screens can reuse them).

export const RELAX_IMAGES = [
  "/zen-beach1.png",
  "/zen-beach2.png",
  "/zen-beach3.png",
  "/zen-beach4.png",
  "/zen-beach5.png",
  "/zen-beach6.png",
  "/zen-beach7.png",
];

export const RELAX_QUOTES = [
  "Enjoy the quiet. It counts too.",
  "No rush. The day has room.",
  "Clear skies, clear list.",
  "A quiet Pulse is still progress.",
  "Nothing due right now. Breathe.",
];

export interface Relax {
  image: string;
  quote: string;
}

export function randomRelax(): Relax {
  return {
    image: RELAX_IMAGES[Math.floor(Math.random() * RELAX_IMAGES.length)],
    quote: RELAX_QUOTES[Math.floor(Math.random() * RELAX_QUOTES.length)],
  };
}
