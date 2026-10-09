import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { assertPublicUrl } from "@/lib/actions/ssrf";

// Turning pages and files into Markdown text. Markdown keeps headings, lists
// and tables, which matter for docs and pricing pages and for splitting text
// into sensible chunks.

export const KNOWLEDGE_USER_AGENT = "Mozilla/5.0 (compatible; KnowledgeBot/1.0)";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4_000_000;
const MAX_PDF_BYTES = 15_000_000;

export function cleanText(input: string) {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let turndown: TurndownService | null = null;
function markdown(html: string) {
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
    turndown.use(gfm);
    // Images and inline media say nothing useful as text.
    const media = new Set(["IMG", "PICTURE", "VIDEO", "AUDIO", "IFRAME", "SVG", "CANVAS", "BUTTON", "FORM", "INPUT", "SELECT"]);
    turndown.remove((node) => media.has(node.nodeName.toUpperCase()));
    // Keep link text, drop URLs: they bloat chunks and mean nothing to the reader.
    turndown.addRule("plainLinks", { filter: "a", replacement: (content) => content });
  }
  return cleanText(turndown.turndown(html));
}

// The main content of an HTML page, as Markdown.
export function htmlToMarkdown(html: string, url?: string) {
  const { document } = parseHTML(html);
  const title = document.querySelector("title")?.textContent?.trim() ?? "";

  try {
    const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
    if (article?.content && (article.textContent ?? "").trim().length > 200) {
      return { title: article.title?.trim() || title || url || "Untitled page", text: markdown(article.content) };
    }
  } catch {
    // Fall through to the whole page.
  }

  // Readability didn't find an article (e.g. a landing page made of cards):
  // take everything except navigation and chrome.
  const { document: fallback } = parseHTML(html);
  fallback.querySelectorAll("script, style, noscript, template, nav, footer, header, aside").forEach((node) => node.remove());
  return { title: title || url || "Untitled page", text: markdown(fallback.body?.innerHTML ?? "") };
}

// Links on a page, resolved against its URL.
export function linksIn(html: string, base: string) {
  const { document } = parseHTML(html);
  const links: string[] = [];
  document.querySelectorAll("a[href]").forEach((anchor) => {
    try {
      links.push(new URL(anchor.getAttribute("href") ?? "", base).toString());
    } catch {
      // Not a URL.
    }
  });
  return links;
}

export async function pdfToText(buffer: Uint8Array) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse(buffer);
  const result = await parser.getText();
  return cleanText(result.text ?? "");
}

export async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  await assertPublicUrl(url);
  return fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    headers: {
      "user-agent": KNOWLEDGE_USER_AGENT,
      accept: "text/html,application/xhtml+xml,text/markdown,text/plain,application/pdf;q=0.9,*/*;q=0.8",
    },
  });
}

export type StaticPage =
  | { kind: "html"; html: string; title: string; text: string }
  | { kind: "text"; title: string; text: string };

// Downloads a page without running its JavaScript (see read-page.ts for that).
export async function fetchStatic(url: string): Promise<StaticPage> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`The page returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/pdf") || /\.pdf$/i.test(new URL(url).pathname)) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_PDF_BYTES) throw new Error("The PDF is larger than 15 MB");
    return { kind: "text", title: decodeURIComponent(new URL(url).pathname.split("/").pop() || url), text: await pdfToText(buffer) };
  }

  const body = await response.text();
  if (body.length > MAX_HTML_BYTES) throw new Error("The page is too large to import");
  if (contentType.includes("text/plain") || contentType.includes("markdown") || /\.(md|markdown|txt)$/i.test(new URL(url).pathname)) {
    const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    return { kind: "text", title: heading || url, text: cleanText(body) };
  }
  const { title, text } = htmlToMarkdown(body, url);
  return { kind: "html", html: body, title, text };
}

export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "application/pdf" || name.endsWith(".pdf")) return pdfToText(new Uint8Array(buffer));

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ buffer });
    return markdown(result.value);
  }

  if (/\.(txt|md|markdown|csv|json|html?)$/.test(name) || file.type.startsWith("text/")) {
    const raw = buffer.toString("utf8");
    if (/\.html?$/.test(name) || file.type === "text/html") return htmlToMarkdown(raw).text;
    return cleanText(raw);
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT, Markdown, CSV or HTML file.");
}
