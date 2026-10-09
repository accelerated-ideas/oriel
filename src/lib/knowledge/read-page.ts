import "server-only";
import { fetchStatic, htmlToMarkdown, linksIn } from "./extract";
import { renderMode, type PageRenderer } from "./renderer";

export type ReadResult = { title: string; text: string; rendered: boolean; links: string[] };

// Less text than this from a page that has scripts: it's probably built in the browser.
const MIN_STATIC_TEXT = 250;

export const NEEDS_JAVASCRIPT =
  "This page needs JavaScript to show its content. Turn on page rendering, or upload the content instead.";

export function looksClientRendered(html: string, text: string) {
  return text.length < MIN_STATIC_TEXT && /<script[\s>]/i.test(html);
}

// Reads a page the cheap way first; only pages that come back nearly empty
// are opened in a browser.
export async function readPage(url: string, renderer: PageRenderer | null): Promise<ReadResult> {
  const page = await fetchStatic(url);
  if (page.kind === "text") return { title: page.title, text: page.text, rendered: false, links: [] };
  if (!looksClientRendered(page.html, page.text)) {
    return { title: page.title, text: page.text, rendered: false, links: linksIn(page.html, url) };
  }

  if (!renderer || renderMode() === "off") throw new Error(NEEDS_JAVASCRIPT);
  const rendered = await renderer.render(url);
  const { title, text } = htmlToMarkdown(rendered.html, url);
  if (text.length < 20) throw new Error("No readable text was found, even after running the page's JavaScript.");
  return { title, text, rendered: true, links: linksIn(rendered.html, rendered.url) };
}
