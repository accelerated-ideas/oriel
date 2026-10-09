"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks, Loader2, Minus, Search, X } from "lucide-react";
import { actionAddFoundPages, actionListFoundPages } from "@/server-actions/knowledge";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Choosing which found pages to add. Selection is either a list of ticked
// pages, or "everything matching the search" minus a few unticked ones, so
// thousands of pages can be chosen without loading them all.
type Selection = { all: boolean; urls: Set<string> };

function Checkbox({ state }: { state: "on" | "off" | "some" }) {
  return (
    <span
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] transition-colors duration-150",
        state === "off" ? "bg-surface shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]" : "bg-accent text-white",
      )}
    >
      {state === "on" && <Check className="size-3" strokeWidth={3} />}
      {state === "some" && <Minus className="size-3" strokeWidth={3} />}
    </span>
  );
}

function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

export function ChoosePagesSheet({
  agentId,
  importId,
  site,
  open,
  onOpenChange,
}: {
  agentId: string;
  importId: string | null;
  site: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selection, setSelection] = useState<Selection>({ all: true, urls: new Set() });

  const load = async (offset: number, search: string) => {
    if (!importId) return;
    setLoading(true);
    const result = await runAction(() => actionListFoundPages({ agentId, importId, query: search, offset }));
    if (result) {
      setUrls((current) => (offset === 0 ? result.data.urls : [...current, ...result.data.urls]));
      setTotal(result.data.total);
    }
    setLoading(false);
  };

  // Everything is chosen to start with; searching narrows what "all" means.
  useEffect(() => {
    if (!open) return;
    setSelection({ all: true, urls: new Set() });
    const timer = setTimeout(() => void load(0, query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [open, importId, query]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open, importId]);

  const isChosen = (url: string) => (selection.all ? !selection.urls.has(url) : selection.urls.has(url));
  const chosen = selection.all ? Math.max(0, total - selection.urls.size) : selection.urls.size;
  const allState = chosen === 0 ? "off" : chosen === total ? "on" : "some";

  const toggle = (url: string) =>
    setSelection((current) => {
      const next = new Set(current.urls);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return { all: current.all, urls: next };
    });

  async function add() {
    if (!importId || chosen === 0) return;
    setAdding(true);
    await runAction(
      () => actionAddFoundPages({ agentId, importId, selection: { all: selection.all, query, urls: [...selection.urls] } }),
      {
        onSuccess: () => {
          onOpenChange(false);
          router.refresh();
        },
        success: `Adding ${chosen.toLocaleString("en-US")} ${chosen === 1 ? "page" : "pages"}`,
      },
    );
    setAdding(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader icon={<ListChecks />} title="Choose pages" description={`Found on ${site}. Only the pages you add are read.`} />
        <div className="flex items-center gap-3 border-b border-line px-6 pb-4">
          <button
            type="button"
            onClick={() => setSelection({ all: allState !== "on", urls: new Set() })}
            className="flex items-center gap-2.5 text-[13.5px] font-medium"
            aria-label={allState === "on" ? "Deselect all" : "Select all"}
          >
            <Checkbox state={allState} />
            {query ? "All matching" : "All"}
          </button>
          <div className="ml-auto flex h-9 w-full max-w-[260px] items-center gap-2 rounded-[10px] bg-surface px-3 shadow-border focus-within:shadow-[0_0_0_1.5px_var(--color-accent)]">
            {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-faint" /> : <Search className="size-4 shrink-0 text-faint" />}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter, e.g. /docs"
              aria-label="Filter pages"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-faint focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-faint hover:text-ink" aria-label="Clear filter">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <SheetBody className="px-3 py-2">
          {urls.length === 0 && !loading ? (
            <p className="px-3 py-10 text-center text-[13.5px] text-muted">{query ? `No pages match “${query}”.` : "No pages left to choose."}</p>
          ) : (
            <ul>
              {urls.map((url) => (
                <li key={url}>
                  <button
                    type="button"
                    onClick={() => toggle(url)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <Checkbox state={isChosen(url) ? "on" : "off"} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2" title={url}>
                      {pathOf(url)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {urls.length < total && (
            <div className="flex justify-center py-2">
              <Button variant="ghost" size="sm" loading={loading} onClick={() => void load(urls.length, query)}>
                Show more
              </Button>
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <p className="text-[13px] text-muted tabular">
            <span className="font-medium text-ink">{chosen.toLocaleString("en-US")}</span> of {total.toLocaleString("en-US")} chosen
          </p>
          <Button onClick={() => void add()} loading={adding} disabled={chosen === 0}>
            Add {chosen.toLocaleString("en-US")} {chosen === 1 ? "page" : "pages"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
