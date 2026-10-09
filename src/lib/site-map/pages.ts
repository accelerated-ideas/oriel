// Site map pages: reading pasted lists, cleaning up links, naming pages.
// Shared by the import panel (live preview) and the server actions.

// The most any site map holds. Plans allow fewer (site_map_pages in
// src/config/subscription-plans.ts); self-hosted installs get this many. A site
// map is places in the product, not every page of a site: content (articles,
// docs, a blog) belongs in Knowledge, which reads it and links to it too.
export const SITE_MAP_MAX_PAGES = 10_000;

export type PageDraft = { title: string; path: string; description: string };

const TRACKING_PARAMS = /^(utm_[a-z]+|ref|fbclid|gclid|mc_cid|mc_eid)$/i;

function originOf(siteUrl: string | null) {
  try {
    return siteUrl ? new URL(siteUrl).origin : null;
  } catch {
    return null;
  }
}

const bareHost = (host: string) => host.replace(/^www\./, "");

// A path on the assistant's site (/settings/billing), or a full URL when it's
// another site. Null when it isn't a link.
export function cleanLink(value: string, siteUrl: string | null): string | null {
  const raw = value.trim().replace(/^<|>$/g, "");
  if (!raw || /\s/.test(raw)) return null;
  const isPath = raw.startsWith("/") && !raw.startsWith("//");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : /^www\./i.test(raw) ? `https://${raw}` : null;
  if (!isPath && !withScheme) return null;
  try {
    const url = new URL(isPath ? raw : withScheme!, "https://site.invalid");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    const path = url.pathname + url.search;
    if (isPath) return path;
    const site = originOf(siteUrl);
    const sameSite = site && bareHost(new URL(site).host) === bareHost(url.host);
    return sameSite ? path : url.toString();
  } catch {
    return null;
  }
}

// IDs and hashes say nothing about the page ("/projects/8f3a…/settings").
const looksLikeId = (segment: string) =>
  /^\d+$/.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment) || (segment.length > 20 && /\d/.test(segment) && !/[-_ ]/.test(segment));

function humanize(segment: string) {
  let text = segment;
  try {
    text = decodeURIComponent(segment);
  } catch {
    // Keep it as it is.
  }
  text = text.replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_+]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

// A readable name from the link: /settings/api-keys → "Api keys", with the
// parent added when the last part alone is ambiguous ("Settings › General").
export function nameFromLink(link: string, withParent = false) {
  let path = link;
  try {
    path = new URL(link, "https://site.invalid").pathname;
  } catch {
    // A plain path.
  }
  const segments = path.split("/").filter((segment) => segment && !looksLikeId(segment)).map(humanize).filter(Boolean);
  if (segments.length === 0) {
    if (/^https?:\/\//i.test(link)) {
      try {
        return new URL(link).hostname.replace(/^www\./, "");
      } catch {
        // Fall through.
      }
    }
    return "Home";
  }
  const last = segments[segments.length - 1];
  return withParent && segments.length > 1 ? `${segments[segments.length - 2]} › ${last}` : last;
}

// One CSV line, with quoted cells ("Change plan, update card").
function csvCells(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell.trim()) quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function cellsOf(line: string) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(" | ")) return line.split(" | ");
  if (line.includes(",")) return csvCells(line);
  return [line];
}

const SEPARATORS = /^[\s\-–—:|•*]+|[\s\-–—:|•*]+$/g;

// A line that isn't in columns: "[Billing](/settings/billing): Change plan"
// (Markdown), or "Billing /settings/billing Change plan".
function looseLine(line: string, siteUrl: string | null) {
  const markdown = line.match(/\[([^\]]*)\]\(([^)\s]+)\)/);
  if (markdown && cleanLink(markdown[2], siteUrl)) {
    return { link: markdown[2], title: markdown[1].trim(), description: line.slice(markdown.index! + markdown[0].length).replace(SEPARATORS, "") };
  }
  const words = line.split(/\s+/);
  const at = words.findIndex((word) => cleanLink(word, siteUrl) !== null);
  if (at === -1) return null;
  return {
    link: words[at],
    title: words.slice(0, at).join(" ").replace(SEPARATORS, ""),
    description: words.slice(at + 1).join(" ").replace(SEPARATORS, ""),
  };
}

// Reads a pasted list: one page per line, either just the link or columns
// from a spreadsheet or CSV (name, link and description, in any order).
// Lines without a link are skipped and counted, except a header row.
export function parsePageList(text: string, siteUrl: string | null) {
  const pages: PageDraft[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  lines.forEach((line, index) => {
    const cells = cellsOf(line).map((cell) => cell.trim());
    const linkAt = cells.findIndex((cell) => cleanLink(cell, siteUrl) !== null);
    let found: { link: string; title: string; description: string } | null = null;
    if (linkAt > -1) {
      const rest = cells.filter((cell, i) => i !== linkAt && cell);
      // Unquoted commas in a description split it into more cells.
      found = { link: cells[linkAt], title: rest[0] ?? "", description: rest.slice(1).join(", ") };
    } else {
      found = looseLine(line, siteUrl);
    }
    if (!found) {
      const header = index === 0 && cells.some((cell) => /^(path|url|link|page|address)s?$/i.test(cell));
      if (!header) skipped++;
      return;
    }
    const path = cleanLink(found.link, siteUrl)!;
    if (seen.has(path)) {
      duplicates++;
      return;
    }
    seen.add(path);
    pages.push({ title: found.title.slice(0, 120), path: path.slice(0, 500), description: found.description.slice(0, 1000) });
  });

  // Unnamed pages are named from their links; clashing names get their parent.
  const auto = pages.filter((page) => !page.title);
  const counts = new Map<string, number>();
  for (const page of auto) {
    const name = nameFromLink(page.path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const page of auto) {
    const name = nameFromLink(page.path);
    page.title = (counts.get(name)! > 1 ? nameFromLink(page.path, true) : name).slice(0, 120);
  }
  return { pages, skipped, duplicates };
}
