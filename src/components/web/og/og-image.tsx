import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";

// The picture shown when a page of the site is shared (opengraph-image.tsx in
// each page's folder): the brand, the page's headline, and the assistant's
// call screen from the launch film's poster.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const PAPER = "#f3f0eb";
const INK = "#18181b";
const INK_2 = "#3f3f46";
const MUTED = "#71717a";
const ACCENT = "#6352f2";
// The logo's sound wave: bar heights in a 32-unit box (src/components/dashboard/logo.tsx).
const BARS = [5.5, 10.5, 16, 9.5, 5];

const here = join(process.cwd(), "src/components/web/og");
// Read once per server process. The widget is cut from the poster at the
// size it's drawn (366×600), its edges faded into the paper.
const assets = Promise.all([
  readFile(join(here, "funnel-display-600.ttf")),
  readFile(join(here, "figtree-400.ttf")),
  readFile(join(here, "figtree-600.ttf")),
  readFile(join(here, "widget.jpg")),
]);

export async function ogImage({ title, subtitle }: { title: string; subtitle: string }) {
  const [funnel, figtree, figtreeBold, widget] = await assets;
  const host = new URL(BRAND.siteUrl).host;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: PAPER, padding: "64px 56px 64px 72px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="52" height="52" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="16" fill={ACCENT} />
              {BARS.map((height, index) => (
                <line
                  key={index}
                  x1={8.8 + index * 3.6}
                  x2={8.8 + index * 3.6}
                  y1={16 - height / 2}
                  y2={16 + height / 2}
                  stroke="#fff"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              ))}
            </svg>
            <div style={{ fontFamily: "Funnel Display", fontSize: 40, color: INK, letterSpacing: -1 }}>{BRAND.name}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ fontFamily: "Funnel Display", fontSize: 76, lineHeight: 1, letterSpacing: -2.6, color: INK }}>{title}</div>
            <div style={{ fontFamily: "Figtree", fontSize: 30, lineHeight: 1.35, color: INK_2 }}>{subtitle}</div>
          </div>

          <div style={{ fontFamily: "Figtree", fontWeight: 600, fontSize: 24, color: MUTED }}>{host}</div>
        </div>

        <img
          src={`data:image/jpeg;base64,${widget.toString("base64")}`}
          width={366}
          height={600}
          alt=""
          style={{ marginTop: -50, marginBottom: -50 }}
        />
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Funnel Display", data: funnel, weight: 600, style: "normal" },
        { name: "Figtree", data: figtree, weight: 400, style: "normal" },
        { name: "Figtree", data: figtreeBold, weight: 600, style: "normal" },
      ],
    },
  );
}
