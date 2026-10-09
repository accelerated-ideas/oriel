// Shapes for the Face and Hive avatars, shared by the widget's canvas, the
// launcher (the embed script inlines them when it's built) and the
// dashboard's small avatars. Everything is in a 100×100 box.

const round = (value: number) => Math.round(value * 100) / 100;

// A rounded square that curves all the way round (a superellipse).
export function squirclePath(cx: number, cy: number, a: number, b: number, n = 4.2, steps = 48) {
  let d = "";
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = cx + a * Math.sign(cos) * Math.abs(cos) ** (2 / n);
    const y = cy + b * Math.sign(sin) * Math.abs(sin) ** (2 / n);
    d += `${i ? "L" : "M"}${round(x)} ${round(y)}`;
  }
  return `${d}Z`;
}

// A smile line whose lower lip drops by `depth` into an open "D".
export function mouthPath(cx: number, cy: number, width: number, depth: number, lift: number) {
  const left = round(cx - width / 2);
  const right = round(cx + width / 2);
  const corner = round(cy - lift);
  return `M${left} ${corner}Q${round(cx)} ${round(cy + lift)} ${right} ${corner}Q${round(cx)} ${round(cy + 2 * depth + lift)} ${left} ${corner}Z`;
}

// The face at small sizes: the tile fills the box, features are a bit bolder.
export const FACE_GLYPH = {
  tile: squirclePath(50, 50, 46, 44),
  eyes: [
    { x: 29.6, y: 32.3, width: 11, height: 22, radius: 5.5 },
    { x: 59.4, y: 32.3, width: 11, height: 22, radius: 5.5 },
  ],
  mouthStroke: 4.4,
};

// In the launcher's rounded pill the tile is rounder, so it sits with the
// pill's round end instead of looking like a square icon.
export const FACE_PILL_TILE = squirclePath(50, 50, 46, 44, 2.6);

// `open` from 0 (a closed smile) to 1 (talking).
export function faceGlyphMouth(open: number) {
  return mouthPath(50, 67, 16 - open * 2, 3 + open * 13, 2.2 - open * 1.6);
}

// Seven dots: one in the middle and a ring of six. `band` is the voice band
// (0 low to 6 high) each one follows: low pitches at the bottom, high at the
// top, the strongest band (about 330–540 Hz) in the middle.
export const HIVE_GLYPH = [
  { x: 50, y: 50, band: 2 },
  { x: 81, y: 50, band: 3 },
  { x: 65.5, y: 76.85, band: 0 },
  { x: 34.5, y: 76.85, band: 1 },
  { x: 19, y: 50, band: 4 },
  { x: 34.5, y: 23.15, band: 6 },
  { x: 65.5, y: 23.15, band: 5 },
];
export const HIVE_GLYPH_RADIUS = { center: 12, ring: 10, speaking: 15 };
