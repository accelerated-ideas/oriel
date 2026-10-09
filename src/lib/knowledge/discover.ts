import "server-only";
import { gunzipSync } from "node:zlib";
import { fetchWithTimeout, htmlToMarkdown, linksIn } from "./extract";
import { looksClientRendered } from "./read-page";
import type { PageRenderer } from "./renderer";

// Finds the pages of a site to import.
//   crawl    in order of preference:
//            1. /llms.txt   a list of pages a site publishes for AI tools (often Markdown)
//            2. sitemaps    from robots.txt or /sitemap.xml, nested and gzipped included
//            3. links       followed from the start page, rendering pages built in the browser
//            Only pages under the start URL's path.
//   sitemap  only the pages listed in the given sitemap (and the sitemaps it points to)
// Always same-site pages, allowed by robots.txt and not excluded by the owner.

const MAX_SITEMAP_FILES = 50;
const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|avif|ico|zip|gz|tar|rar|7z|mp4|mov|webm|mp3|wav|css|js|mjs|json|xml|rss|atom|woff2?|ttf|eot|dmg|exe)$/i;
const TRACKING_PARAMS = /^(utm_[a-z]+|ref|fbclid|gclid|mc_cid|mc_eid)$/i;

export type ExcludeRule = { match: "starts_with" | "ends_with" | "contains" | "exact" | "wildcard"; value: string };

export type DiscoverOptions = {
  mode: "crawl" | "sitemap";
  exclude?: ExcludeRule[];
  // Treat ?page=2 and the like as separate pages. Off: one page per path.
  includeQuery?: boolean;
  // Space requests out for sites that can't take many at once.
  slow?: boolean;
};

export function excludes(rules: ExcludeRule[], path: string) {
  return rules.some((rule) => {
    const value = rule.value.trim();
    if (!value) return false;
    if (rule.match === "starts_with") return path.startsWith(value);
    if (rule.match === "ends_with") return path.endsWith(value);
    if (rule.match === "contains") return path.includes(value);
    if (rule.match === "exact") return path === value || path === value.replace(/\/+$/, "");
    const pattern = value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pattern}$`).test(path);
  });
}

export function normalizeUrl(href: string, base: URL, includeQuery = true) {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    if (!includeQuery) url.search = "";
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

// ---------- robots.txt ----------

type Rule = { allow: boolean; pattern: RegExp; length: number };

// "*" matches anything; a trailing "$" anchors the end.
function ruleFor(value: string, allow: boolean): Rule | null {
  if (!value) return null;
  const anchored = value.endsWith("$");
  const body = (anchored ? value.slice(0, -1) : value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return { allow, pattern: new RegExp(`^${body}${anchored ? "$" : ""}`), length: value.length };
}

async function readRobots(origin: string) {
  const sitemaps: string[] = [];
  const rules: Rule[] = [];
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, 8_000);
    if (response.ok) {
      // A group is one or more User-agent lines followed by its rules.
      let agents: string[] = [];
      let afterAgent = false;
      for (const raw of (await response.text()).split("\n")) {
        const line = raw.replace(/#.*/, "").trim();
        const separator = line.indexOf(":");
        if (separator === -1) continue;
        const key = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        if (key === "user-agent") {
          if (!afterAgent) agents = [];
          agents.push(value);
          afterAgent = true;
          continue;
        }
        afterAgent = false;
        if (key === "sitemap" && value) sitemaps.push(value);
        else if ((key === "disallow" || key === "allow") && agents.some((agent) => agent === "*" || /knowledgebot/i.test(agent))) {
          const rule = ruleFor(value, key === "allow");
          if (rule) rules.push(rule);
        }
      }
    }
  } catch {
    // No robots.txt: everything is allowed.
  }
  // The most specific rule wins; ties go to allow.
  const allows = (path: string) => {
    const matching = rules.filter((rule) => rule.pattern.test(path));
    if (matching.length === 0) return true;
    matching.sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
    return matching[0].allow;
  };
  return { sitemaps, allows };
}

// ---------- llms.txt and sitemaps ----------

async function readLlmsTxt(origin: string) {
  try {
    const response = await fetchWithTimeout(`${origin}/llms.txt`, 8_000);
    if (!response.ok || !(response.headers.get("content-type") ?? "").match(/text\/(plain|markdown)/)) return [];
    const text = await response.text();
    return [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => new URL(match[1], origin).toString());
  } catch {
    return [];
  }
}

async function readSitemaps(starts: string[], wanted: number) {
  const queue = [...new Set(starts)];
  const seen = new Set<string>();
  const pages: string[] = [];
  while (queue.length > 0 && seen.size < MAX_SITEMAP_FILES && pages.length < wanted) {
    const location = queue.shift()!;
    if (seen.has(location)) continue;
    seen.add(location);
    try {
      const response = await fetchWithTimeout(location, 10_000);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const xml = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8");
      const locations = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\s\]]+)(?:\]\]>)?\s*<\/loc>/g)].map((match) =>
        match[1].replace(/&amp;/g, "&"),
      );
      if (/<sitemapindex/i.test(xml)) queue.push(...locations);
      else pages.push(...locations);
    } catch {
      // Skip sitemaps that fail to load.
    }
  }
  return pages;
}

// ---------- discovery ----------

const SLOW_DELAY_MS = 1_500;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function discoverPages(
  startUrl: string,
  limit: number,
  renderer: PageRenderer | null,
  options: DiscoverOptions = { mode: "crawl" },
) {
  const start = new URL(startUrl);
  const includeQuery = options.includeQuery ?? false;
  const rules = options.exclude ?? [];
  // A sitemap can list pages anywhere on the site; a crawl stays under its path.
  const prefix = options.mode === "sitemap" ? "" : start.pathname.replace(/\/+$/, "");
  const robots = await readRobots(start.origin);
  const found = new Set<string>();

  const add = (href: string) => {
    const url = normalizeUrl(href, start, includeQuery);
    if (!url || found.size >= limit || found.has(url)) return false;
    const parsed = new URL(url);
    if (parsed.origin !== start.origin || !parsed.pathname.startsWith(prefix)) return false;
    const path = parsed.pathname + parsed.search;
    if (SKIP_EXTENSIONS.test(parsed.pathname) || !robots.allows(path) || excludes(rules, path)) return false;
    found.add(url);
    return true;
  };

  if (options.mode === "sitemap") {
    (await readSitemaps([start.toString()], limit * 3)).forEach(add);
    return [...found];
  }

  add(start.toString());

  const listed = await readLlmsTxt(start.origin);
  listed.forEach(add);
  if (found.size > 1) return [...found];

  const mapped = await readSitemaps([...robots.sitemaps, `${start.origin}/sitemap.xml`], limit * 3);
  mapped.forEach(add);
  if (found.size > 1) return [...found];

  // No list of pages: follow links, a few hundred pages at most.
  const queue = [...found];
  const visited = new Set<string>();
  while (queue.length > 0 && found.size < limit && visited.size < Math.min(limit * 2, 600)) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    if (options.slow && visited.size > 1) await pause(SLOW_DELAY_MS);
    try {
      const response = await fetchWithTimeout(next);
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("html")) continue;
      let html = await response.text();
      // Single-page apps often only have their links after JavaScript runs.
      if (renderer && looksClientRendered(html, htmlToMarkdown(html, next).text)) {
        html = (await renderer.render(next)).html;
      }
      for (const link of linksIn(html, next)) {
        if (add(link)) queue.push(normalizeUrl(link, start, includeQuery)!);
      }
    } catch {
      // Skip pages that fail to load.
    }
  }
  return [...found];
}
