import "server-only";
import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
import { assertPublicUrl } from "@/lib/actions/ssrf";
import { KNOWLEDGE_USER_AGENT } from "./extract";

// A headless browser for pages that only have content after their
// JavaScript runs (single-page apps). Only the knowledge worker uses it.
//   KNOWLEDGE_BROWSER=local   (default) Chromium in this process: the serverless
//                             build on Vercel/Lambda, else CHROMIUM_PATH or an
//                             installed Chrome
//   KNOWLEDGE_BROWSER=remote  a hosted browser at BROWSER_WS_ENDPOINT (CDP),
//                             e.g. Browserless
//   KNOWLEDGE_BROWSER=off     never render; such pages fail with a clear message

export function renderMode() {
  const mode = process.env.KNOWLEDGE_BROWSER;
  if (mode === "off") return "off" as const;
  if (mode === "remote" || (!mode && process.env.BROWSER_WS_ENDPOINT)) return "remote" as const;
  return "local" as const;
}

const INSTALLED_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (renderMode() === "remote") {
    if (!process.env.BROWSER_WS_ENDPOINT) throw new Error("BROWSER_WS_ENDPOINT isn't set");
    return chromium.connectOverCDP(process.env.BROWSER_WS_ENDPOINT);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ executablePath: await serverless.executablePath(), args: serverless.args, headless: true });
  }
  const executablePath = process.env.CHROMIUM_PATH || INSTALLED_CHROME.find((path) => existsSync(path));
  return chromium.launch({ executablePath, headless: true });
}

const NAVIGATION_TIMEOUT_MS = 20_000;
const SETTLE_TIMEOUT_MS = 8_000;

// One browser per worker run, opened on first use, with a few pages at a time.
export class PageRenderer {
  private browser: Promise<Browser> | null = null;
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private maxPages = 2) {}

  private async slot() {
    if (this.active < this.maxPages) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  async render(url: string) {
    if (renderMode() === "off") throw new Error("Page rendering is off");
    this.browser ??= launch().catch((error) => {
      this.browser = null;
      console.error("Couldn't start a browser", error);
      throw new Error("Couldn't start a browser to read this page. Check KNOWLEDGE_BROWSER, or upload the content instead.");
    });
    const browser = await this.browser;
    await this.slot();
    const context = await browser.newContext({ userAgent: KNOWLEDGE_USER_AGENT, serviceWorkers: "block" });
    try {
      // The page's own scripts run here, so they must not reach internal addresses either.
      const allowed = new Map<string, Promise<boolean>>();
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (["image", "media", "font"].includes(request.resourceType())) return route.abort();
        const target = request.url();
        if (!/^https?:/.test(target)) return route.continue();
        const origin = new URL(target).origin;
        if (!allowed.has(origin)) allowed.set(origin, assertPublicUrl(target).then(() => true, () => false));
        return (await allowed.get(origin)) ? route.continue() : route.abort();
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
      // Some apps keep rendering after the network goes quiet: wait for the text to stop growing.
      let length = -1;
      for (let i = 0; i < 8; i++) {
        const next = await page.evaluate(() => document.body?.innerText.length ?? 0);
        if (next > 200 && next === length) break;
        length = next;
        await page.waitForTimeout(400);
      }
      return { html: await page.content(), url: page.url() };
    } finally {
      await context.close().catch(() => {});
      this.release();
    }
  }

  async close() {
    const browser = await this.browser?.catch(() => null);
    await browser?.close().catch(() => {});
    this.browser = null;
  }
}
