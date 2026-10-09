import { type AvatarDrawer, clamp01, ease, lerp } from "./signal";

const TAU = Math.PI * 2;

function squircle(g: CanvasRenderingContext2D, a: number, b: number) {
  const n = 4.2;
  g.beginPath();
  for (let i = 0; i <= 80; i++) {
    const angle = (i / 80) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = a * Math.sign(cos) * Math.abs(cos) ** (2 / n);
    const y = b * Math.sign(sin) * Math.abs(sin) ** (2 / n);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(w, h) / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// A rounded tile with two eyes. It blinks and glances around at rest, leans
// in and nods while the visitor talks, looks up while it thinks, and its
// mouth opens with each syllable: wider on low vowels, narrower on bright sounds.
export function faceDrawer(): AvatarDrawer {
  let blinkAt = -1;
  let dartAt = 0;
  let dartX = 0;
  let dartY = 0;
  let gazeX = 0;
  let gazeY = 0;

  return (g, S, f, colors) => {
    const u = S / 100;
    const { idle, connecting, thinking, listening, speaking } = f.mix;
    const level = f.level;
    const drift = f.motion;
    // 0 on the call screen, 1 at the chat header's size and below.
    const small = clamp01((100 - S) / 40);

    if (blinkAt < 0) blinkAt = f.t + 0.8 + Math.random() * 2.4;
    let blink = 0;
    if (drift && f.t >= blinkAt) {
      const progress = (f.t - blinkAt) / 0.17;
      if (progress >= 1) blinkAt = f.t + 2.2 + Math.random() * 3.8;
      else blink = Math.sin(Math.PI * progress);
    }
    if (f.t >= dartAt) {
      dartX = Math.random() - 0.5;
      dartY = Math.random() - 0.5;
      dartAt = f.t + 0.45 + Math.random() * 0.8;
    }
    const lookX =
      idle * (0.9 * Math.sin(f.t * 0.41) + 0.4 * Math.sin(f.t * 1.07 + 1)) * drift +
      thinking * (1 + dartX * 0.5) +
      speaking * 0.25 * Math.sin(f.t * 0.9) * drift +
      listening * dartX * 0.2 * drift;
    const lookY = idle * 0.35 * Math.sin(f.t * 0.63 + 2) * drift + thinking * (-1.15 + dartY * 0.4) + listening * 0.15;
    gazeX += (lookX - gazeX) * ease(f.dt, 0.07);
    gazeY += (lookY - gazeY) * ease(f.dt, 0.07);

    const breathe = Math.sin((f.t * TAU) / 3.6) * drift;
    const scaleX = 1 + 0.012 * breathe * (idle + listening) + 0.03 * level * speaking;
    const scaleY = 1 + 0.012 * breathe * (idle + listening) + 0.05 * level * speaking;
    const lift = -f.onset * 6 * u * speaking + level * 3 * u * listening + connecting * Math.sin((f.t * TAU) / 1.6) * 1.5 * u * drift;
    const tilt = listening * 0.07 - thinking * 0.09 + speaking * 0.03 * Math.sin(f.t * 1.3) * drift;
    const halfW = lerp(38, 46, small) * u;
    const halfH = lerp(36.5, 44, small) * u;

    // A soft shadow under it on the call screen.
    if (small < 1) {
      g.fillStyle = colors.accent;
      g.globalAlpha = (0.14 - 0.04 * f.onset * speaking) * (1 - small);
      g.beginPath();
      g.ellipse(S / 2, S / 2 + 44 * u, 25 * u * (1 - 0.08 * f.onset * speaking), 3 * u, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    }

    g.save();
    g.translate(S / 2, S / 2 + lift - 2 * u * (1 - small));
    g.rotate(tilt);
    g.scale(scaleX, scaleY);
    squircle(g, halfW, halfH);
    const fill = g.createLinearGradient(0, -halfH, 0, halfH);
    fill.addColorStop(0, colors.light);
    fill.addColorStop(0.55, colors.accent);
    fill.addColorStop(1, colors.deep);
    g.fillStyle = fill;
    g.fill();
    g.save();
    g.clip();
    const sheen = g.createRadialGradient(-halfW * 0.45, -halfH * 0.62, 0, -halfW * 0.45, -halfH * 0.62, halfW * 0.9);
    sheen.addColorStop(0, "rgba(255,255,255,0.2)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
    g.restore();

    const k = lerp(1, 1.12, small);
    let eyeH = 19 * u * k;
    eyeH *= 1 - 0.3 * level * speaking;
    eyeH *= 1 + 0.07 * listening + 0.08 * level * listening;
    eyeH *= 1 - 0.1 * thinking;
    // Closed while connecting, then they open.
    const open = (1 - blink) * (1 - 0.9 * connecting);
    const h = Math.max(eyeH * open, 2.4 * u);
    const eyeY = -6 * u - 2.2 * u * level * speaking;
    const gx = gazeX * 3.6 * u;
    const gy = gazeY * 3.6 * u;
    g.fillStyle = colors.on;
    g.strokeStyle = colors.on;
    for (const side of [-1, 1]) {
      const w = 9 * u * k * (h < 4 * u ? 1.15 : 1);
      pill(g, side * 13.5 * u * k + gx - w / 2, eyeY + gy - h / 2, w, h);
      g.fill();
    }

    const low = (f.bands[0] + f.bands[1] + f.bands[2]) / 3;
    const high = (f.bands[4] + f.bands[5] + f.bands[6]) / 3;
    const restWidth = lerp(11 * u, 6.5 * u, thinking);
    const talkWidth = 8 * u + 6 * u * low * level - 2.5 * u * high * level + 3 * u * level;
    const width = lerp(restWidth, talkWidth, speaking) * (1 - 0.3 * connecting) * k;
    const depth = lerp(lerp(2.6 * u, 1.3 * u, clamp01(thinking + connecting)), 2.2 * u + 14 * u * level, speaking) * k;
    const corner = lerp(1.8 * u, 0.4 * u, speaking) * (1 - thinking);
    const x = gx * 0.55 + thinking * 4 * u;
    const y = 15.5 * u * k + gy * 0.4;
    g.beginPath();
    g.moveTo(x - width / 2, y - corner);
    g.quadraticCurveTo(x, y + corner, x + width / 2, y - corner);
    g.quadraticCurveTo(x, y + 2 * depth + corner, x - width / 2, y - corner);
    g.closePath();
    g.lineJoin = "round";
    g.lineWidth = 2.6 * u * k;
    g.stroke();
    g.fill();
    g.restore();
  };
}

