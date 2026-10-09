// Dark or white text, whichever reads better on a brand color. White is kept
// down to a 3:1 contrast, since it usually looks better on mid-tone colors.
// (The embed loader has its own copy: it can't import app code.)
export function textOn(hex: string) {
  const match = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return "#18181b";
  const [r, g, b] = match.slice(1).map((part) => {
    const c = parseInt(part, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.3 ? "#18181b" : "#ffffff";
}

function channels(hex: string) {
  const match = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return match ? match.slice(1).map((part) => parseInt(part, 16)) : [99, 82, 242];
}

// `a` moved toward `b` by `amount` (0–1), as a hex color.
export function mixHex(a: string, b: string, amount: number) {
  const from = channels(a);
  const to = channels(b);
  return `#${from.map((value, i) => Math.round(value + (to[i] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

export function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The brand color, nudged so marks drawn in it (like the Hive's dots) stay
// visible: lighter on the near-black launcher, darker on white for pale colors.
// (The embed loader has its own copy.)
export function markColor(hex: string, on: "light" | "dark") {
  const lum = luminance(hex);
  if (on === "dark") return lum < 0.06 ? mixHex(hex, "#ffffff", 0.7) : hex;
  return lum > 0.55 ? mixHex(hex, "#09090b", 0.3) : hex;
}
