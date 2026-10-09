import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas", "linkedom", "playwright-core", "@sparticuz/chromium"],
  // The knowledge worker opens Chromium on Vercel. File tracing misses the
  // compressed browser and parts of Playwright, so ship them explicitly.
  outputFileTracingIncludes: {
    "/api/knowledge/worker": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**"],
  },
  // The badge sits on top of the widget's controls inside its small iframe.
  // Compile and runtime errors still show without it.
  devIndicators: false,
  experimental: {
    // Knowledge uploads go through a server action.
    serverActions: { bodySizeLimit: "40mb" },
  },
  async headers() {
    return [
      {
        source: "/api/widget/config",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        // The embed loads Figtree from here on customer sites.
        source: "/fonts/:file*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
