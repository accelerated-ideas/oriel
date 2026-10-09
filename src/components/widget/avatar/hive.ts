import { type AvatarColors, type AvatarDrawer, type AvatarFrame, clamp01 } from "./signal";

const TAU = Math.PI * 2;
// How long a ripple takes to move out by one ring, in seconds.
const RING_DELAY = 0.075;

type Dot = { x: number; y: number; ring: number; angle: number; band: number };

const lattices = new Map<number, Dot[]>();

// Dots on a hex grid, `rings` deep around a center dot. Each follows a voice
// band by where it sits: low pitches at the bottom, high at the top.
function lattice(rings: number) {
  let dots = lattices.get(rings);
  if (dots) return dots;
  dots = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (ring > rings) continue;
      const x = q + r / 2;
      const y = (r * Math.sqrt(3)) / 2;
      const fromBottom = Math.acos(Math.max(-1, Math.min(1, y / (Math.hypot(x, y) || 1))));
      dots.push({ x, y, ring, angle: Math.atan2(y, x), band: ring === 0 ? 2 : Math.round((fromBottom / Math.PI) * 6) });
    }
  }
  lattices.set(rings, dots);
  return dots;
}

function drawLattice(g: CanvasRenderingContext2D, S: number, f: AvatarFrame, colors: AvatarColors, rings: number, alpha: number) {
  const u = S / 100;
  const { idle, connecting, thinking, listening, speaking } = f.mix;
  const spacing = rings === 1 ? 32 * u : (38 * u) / rings;
  const largest = spacing * (rings === 1 ? 0.46 : 0.44);
  const smallest = spacing * (rings === 1 ? 0.3 : rings === 2 ? 0.22 : 0.15);
  const sweep = f.t * TAU * 0.75;
  const wave = ((f.t * 1.4) % 1) * (rings + 1.6) - 0.3;
  const base = rings === 1 ? 0.5 : rings === 2 ? 0.4 : 0.28;

  g.fillStyle = colors.mark;
  for (const dot of lattice(rings)) {
    // Speech moves outward from the center; the visitor's voice moves inward.
    const said = dot.ring === 0 ? f.level : f.past(dot.ring * RING_DELAY) * (0.35 + 0.65 * f.bands[dot.band]);
    const heard = f.past((rings - dot.ring) * RING_DELAY) * 0.85;
    const offset = Math.atan2(Math.sin(dot.angle - sweep - dot.ring * 0.4), Math.cos(dot.angle - sweep - dot.ring * 0.4));
    const pondering = dot.ring === 0 ? 0.35 : Math.exp(-(offset * offset) / 0.35) * (0.4 + (0.6 * dot.ring) / rings);
    const resting = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin((f.t * TAU) / 3.2 - dot.ring * 1.1)) * f.motion;
    const joining = 0.1 + 0.8 * Math.exp(-((dot.ring - wave) ** 2) / 0.35);
    const value = clamp01(
      idle * resting + connecting * joining + listening * Math.max(0.14, heard) + thinking * pondering + speaking * Math.max(0.12, said),
    );
    g.globalAlpha = alpha * (base + (1 - base) * clamp01(value * 1.25));
    g.beginPath();
    g.arc(S / 2 + dot.x * spacing, S / 2 + dot.y * spacing, smallest + (largest - smallest) * value, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

// Three rings on the call screen and two at the chat header's size,
// cross-faded while the panel changes between them; one as a tiny glyph.
export function hiveDrawer(): AvatarDrawer {
  return (g, S, f, colors) => {
    if (S < 44) return drawLattice(g, S, f, colors, 1, 1);
    const full = clamp01((S - 80) / 20);
    if (full < 1) drawLattice(g, S, f, colors, 2, 1 - full);
    if (full > 0) drawLattice(g, S, f, colors, 3, full);
  };
}
