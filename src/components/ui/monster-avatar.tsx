import { cn } from "@/lib/utils";

// A little monster drawn from a seed (a user ID, a visitor ID…): the same seed
// always gives the same monster, and different seeds almost never collide.
// Pure SVG, no assets, works in server and client components.

const INK = "#18181B";

const PALETTES = [
  { bg: "#ECEAFE", body: "#7C6CF6", shade: "#5644D8" }, // iris
  { bg: "#FFE9DF", body: "#FF8A5B", shade: "#E0602F" }, // coral
  { bg: "#DDF7EB", body: "#36C88B", shade: "#18A06A" }, // mint
  { bg: "#E0F0FE", body: "#45A8F5", shade: "#1F83D3" }, // sky
  { bg: "#FEF3D6", body: "#F6BC3A", shade: "#D39410" }, // sun
  { bg: "#FDE6F1", body: "#F278B1", shade: "#D24F8B" }, // bubblegum
  { bg: "#D8F5F3", body: "#2CBAB3", shade: "#13918B" }, // teal
  { bg: "#F2E6FD", body: "#AC69EF", shade: "#8743CF" }, // grape
  { bg: "#ECF7DD", body: "#8FC94A", shade: "#6AA329" }, // lime
  { bg: "#FFE4E3", body: "#F25F5A", shade: "#CF3C37" }, // tomato
];

// Body outlines, with where the top, eyes and mouth sit.
const BODIES = [
  { path: "M8 70V38C8 22 19 13 32 13S56 22 56 38V70Z", top: 13, eyes: 33, mouth: 45, pointy: false },
  { path: "M13 70V30C13 17 21 9 32 9S51 17 51 30V70Z", top: 9, eyes: 29, mouth: 41, pointy: false },
  { path: "M11 70V27Q11 15 23 15H41Q53 15 53 27V70Z", top: 15, eyes: 32, mouth: 44, pointy: false },
  { path: "M4 70V45C4 30 16 22 32 22S60 30 60 45V70Z", top: 22, eyes: 38, mouth: 49, pointy: false },
  { path: "M10 70V41C10 28 22 20 32 7C42 20 54 28 54 41V70Z", top: 7, eyes: 37, mouth: 48, pointy: true },
];

type Eye = { x: number; y: number; r: number };

function hashSeed(seed: string) {
  // FNV-1a
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function random(seed: number) {
  // mulberry32
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function design(seed: string) {
  const next = random(hashSeed(seed));
  const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)];

  const palette = pick(PALETTES);
  const body = pick(BODIES);
  const cx = 32;

  const eyeSets: Eye[][] = [
    [{ x: cx, y: body.eyes, r: 9.2 }],
    [
      { x: cx - 8.8, y: body.eyes, r: 6.2 },
      { x: cx + 8.8, y: body.eyes, r: 6.2 },
    ],
    [
      { x: cx - 8.2, y: body.eyes, r: 7.2 },
      { x: cx + 9.4, y: body.eyes + 1, r: 4.9 },
    ],
    [
      { x: cx - 10.4, y: body.eyes + 1.5, r: 4.7 },
      { x: cx, y: body.eyes - 3.2, r: 5.6 },
      { x: cx + 10.4, y: body.eyes + 1.5, r: 4.7 },
    ],
  ];
  const eyes = pick(eyeSets);
  const look = pick([
    { x: 0, y: 0.15 },
    { x: 0.32, y: 0.12 },
    { x: -0.32, y: 0.12 },
    { x: 0, y: -0.25 },
  ]);

  return {
    palette,
    body,
    cx,
    eyes,
    look,
    sleepy: next() < 0.2,
    accessory: body.pointy
      ? pick(["none", "tuft"] as const)
      : pick(["none", "horns", "antennae", "ears", "tuft", "none"] as const),
    mouth: pick(["smile", "grin", "fangs", "oh", "smirk", "teeth"] as const),
    cheeks: next() < 0.5,
    spots: next() < 0.35,
  };
}

function Accessory({
  kind,
  top,
  cx,
  body,
  shade,
}: {
  kind: string;
  top: number;
  cx: number;
  body: string;
  shade: string;
}) {
  if (kind === "horns") {
    return (
      <g fill="#FFF3DC" stroke={shade} strokeWidth="1.2" strokeLinejoin="round">
        <path
          d={`M${cx - 11} ${top + 6}Q${cx - 18} ${top - 3} ${cx - 15} ${top - 8}Q${cx - 9} ${top - 2} ${cx - 4} ${top + 3}Z`}
        />
        <path
          d={`M${cx + 11} ${top + 6}Q${cx + 18} ${top - 3} ${cx + 15} ${top - 8}Q${cx + 9} ${top - 2} ${cx + 4} ${top + 3}Z`}
        />
      </g>
    );
  }
  if (kind === "antennae") {
    return (
      <g stroke={shade} strokeWidth="2.4" strokeLinecap="round" fill={shade}>
        <path d={`M${cx - 6} ${top + 4}L${cx - 10} ${top - 4}`} />
        <path d={`M${cx + 6} ${top + 4}L${cx + 10} ${top - 4}`} />
        <circle cx={cx - 10} cy={top - 5} r="3.2" stroke="none" />
        <circle cx={cx + 10} cy={top - 5} r="3.2" stroke="none" />
      </g>
    );
  }
  if (kind === "ears") {
    return (
      <g>
        <circle cx={cx - 17} cy={top + 5} r="7" fill={body} />
        <circle cx={cx + 17} cy={top + 5} r="7" fill={body} />
        <circle cx={cx - 17} cy={top + 5} r="3.6" fill={shade} />
        <circle cx={cx + 17} cy={top + 5} r="3.6" fill={shade} />
      </g>
    );
  }
  if (kind === "tuft") {
    return (
      <g fill={shade}>
        <path
          d={`M${cx} ${top + 3}Q${cx - 3} ${top - 6} ${cx + 1} ${top - 10}Q${cx + 4} ${top - 4} ${cx} ${top + 3}Z`}
        />
        <path
          d={`M${cx - 1} ${top + 3}Q${cx - 9} ${top - 3} ${cx - 8} ${top - 7}Q${cx - 3} ${top - 3} ${cx - 1} ${top + 3}Z`}
        />
        <path
          d={`M${cx + 1} ${top + 3}Q${cx + 8} ${top - 2} ${cx + 8} ${top - 6}Q${cx + 3} ${top - 2} ${cx + 1} ${top + 3}Z`}
        />
      </g>
    );
  }
  return null;
}

function Mouth({ kind, cx, y }: { kind: string; cx: number; y: number }) {
  if (kind === "grin") {
    return (
      <g>
        <path d={`M${cx - 7.5} ${y - 1}Q${cx} ${y + 10} ${cx + 7.5} ${y - 1}Z`} fill={INK} strokeLinejoin="round" />
        <path
          d={`M${cx - 3.6} ${y + 4.6}Q${cx} ${y + 2.4} ${cx + 3.6} ${y + 4.6}Q${cx} ${y + 6.6} ${cx - 3.6} ${y + 4.6}Z`}
          fill="#FF7B93"
        />
      </g>
    );
  }
  if (kind === "fangs") {
    return (
      <g>
        <path d={`M${cx - 4} ${y + 1.6}l1.6 3.4l1.5-3.1Z M${cx + 4} ${y + 1.6}l-1.6 3.4l-1.5-3.1Z`} fill="#fff" />
        <path
          d={`M${cx - 7} ${y}Q${cx} ${y + 4.5} ${cx + 7} ${y}`}
          stroke={INK}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    );
  }
  if (kind === "oh") return <ellipse cx={cx} cy={y + 2} rx="3" ry="3.4" fill={INK} />;
  if (kind === "smirk") {
    return (
      <path
        d={`M${cx - 5} ${y + 1.5}Q${cx + 1} ${y + 4} ${cx + 6} ${y - 0.5}`}
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  if (kind === "teeth") {
    return (
      <g>
        <rect x={cx - 7} y={y - 1.5} width="14" height="7" rx="3.5" fill={INK} />
        <path d={`M${cx - 4.5} ${y - 1.5}h9v2.4h-9Z`} fill="#fff" />
      </g>
    );
  }
  return (
    <path
      d={`M${cx - 6} ${y}Q${cx} ${y + 5.5} ${cx + 6} ${y}`}
      stroke={INK}
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
  );
}

export function MonsterAvatar({
  seed,
  size = 32,
  label,
  className,
}: {
  seed: string;
  size?: number;
  // Accessible name; decorative (hidden) when there's none.
  label?: string;
  className?: string;
}) {
  const monster = design(seed);
  const { palette, body, cx } = monster;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-black/[0.06]", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect width="64" height="64" fill={palette.bg} />
      {/* Slightly zoomed in, so faces stay readable at small sizes. */}
      <g transform="translate(32 46) scale(1.07) translate(-32 -46)">
        <Accessory kind={monster.accessory} top={body.top} cx={cx} body={palette.body} shade={palette.shade} />
        <path d={body.path} fill={palette.body} />
        {/* Sheen */}
        <ellipse
          cx={cx - 11}
          cy={body.top + 9}
          rx="6"
          ry="3.2"
          fill="#fff"
          opacity="0.24"
          transform={`rotate(-32 ${cx - 11} ${body.top + 9})`}
        />
        {monster.spots && (
          <g fill="#fff" opacity="0.2">
            <circle cx={cx + 15} cy={body.mouth + 9} r="3" />
            <circle cx={cx - 16} cy={body.mouth + 13} r="2.2" />
            <circle cx={cx + 6} cy={body.mouth + 16} r="1.8" />
          </g>
        )}
        {monster.cheeks && (
          <g fill="#FF5C7A" opacity="0.32">
            <ellipse cx={cx - 13} cy={body.mouth - 1} rx="3.3" ry="2" />
            <ellipse cx={cx + 13} cy={body.mouth - 1} rx="3.3" ry="2" />
          </g>
        )}
        {monster.eyes.map((eye, index) => (
          <g key={index}>
            <circle cx={eye.x} cy={eye.y} r={eye.r} fill="#fff" />
            <circle
              cx={eye.x + monster.look.x * eye.r}
              cy={eye.y + monster.look.y * eye.r}
              r={eye.r * 0.48}
              fill={INK}
            />
            <circle
              cx={eye.x + monster.look.x * eye.r + eye.r * 0.16}
              cy={eye.y + monster.look.y * eye.r - eye.r * 0.18}
              r={eye.r * 0.15}
              fill="#fff"
            />
            {monster.sleepy && (
              <path
                d={`M${eye.x - eye.r - 0.6} ${eye.y - 0.4}A${eye.r + 0.6} ${eye.r + 0.6} 0 0 1 ${eye.x + eye.r + 0.6} ${eye.y - 0.4}Z`}
                fill={palette.body}
                stroke={palette.shade}
                strokeWidth="1.2"
              />
            )}
          </g>
        ))}
        <Mouth kind={monster.mouth} cx={cx} y={body.mouth} />
      </g>
    </svg>
  );
}
