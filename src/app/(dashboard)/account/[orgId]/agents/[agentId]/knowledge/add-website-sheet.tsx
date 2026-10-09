"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe, Plus, X } from "lucide-react";
import { actionAddPage, actionFindPages } from "@/server-actions/knowledge";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { segmentedItem, segmentedTrack } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Tab = "crawl" | "sitemap" | "page";
type Match = "starts_with" | "ends_with" | "contains" | "exact" | "wildcard";
type Rule = { match: Match; value: string };

const TABS: { value: Tab; label: string }[] = [
  { value: "crawl", label: "Crawl site" },
  { value: "sitemap", label: "Sitemap" },
  { value: "page", label: "Single page" },
];

const MATCHES: { value: Match; label: string }[] = [
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact match" },
  { value: "wildcard", label: "Wildcard" },
];

const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function OptionRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
      <span className="text-[14px]">
        <span className="font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function AddWebsiteSheet({
  agentId,
  defaultUrl,
  open,
  onOpenChange,
  room,
}: {
  agentId: string;
  defaultUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Knowledge characters the workspace can still add (null: no limit).
  room: number | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("crawl");
  const [url, setUrl] = useState(defaultUrl);
  const [sitemap, setSitemap] = useState("");
  const [page, setPage] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [draft, setDraft] = useState<Rule>({ match: "starts_with", value: "" });
  const [includeQuery, setIncludeQuery] = useState(false);
  const [slow, setSlow] = useState(false);
  const [limit, setLimit] = useState(500);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(defaultUrl);
    if (defaultUrl) {
      try {
        setSitemap(`${new URL(defaultUrl).origin}/sitemap.xml`);
      } catch {
        // Not a full URL yet.
      }
    }
  }, [open, defaultUrl]);

  const addRule = () => {
    if (!draft.value.trim()) return;
    setRules((current) => [...current, { match: draft.match, value: draft.value.trim() }]);
    setDraft((current) => ({ ...current, value: "" }));
  };

  const target = tab === "crawl" ? url : tab === "sitemap" ? sitemap : page;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target.trim()) return;
    setLoading(true);
    const done = () => {
      onOpenChange(false);
      router.refresh();
    };
    if (tab === "page") {
      await runAction(() => actionAddPage({ agentId, url: page }), { success: "Page added", onSuccess: done });
    } else {
      await runAction(
        () => actionFindPages({ agentId, mode: tab, url: target, exclude: rules, includeQuery, slow, limit }),
        { success: "Finding pages. You'll choose which to add.", onSuccess: done },
      );
    }
    setLoading(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader icon={<Globe />} title="Add website" description="Public pages only. Logged-in areas can't be read." />
          <div className="px-6">
            <div className={cn(segmentedTrack, "flex w-full")} role="tablist">
              {TABS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.value}
                  onClick={() => setTab(item.value)}
                  className={cn(segmentedItem(tab === item.value), "flex-1")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <SheetBody className="flex flex-col gap-5">
            {tab === "crawl" && (
              <Field label="Site address" htmlFor="kb-crawl-url" hint="Finds pages under this address from its sitemap or links. You choose which to add next.">
                <Input id="kb-crawl-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com/docs" />
              </Field>
            )}
            {tab === "sitemap" && (
              <Field label="Sitemap" htmlFor="kb-sitemap-url" hint="Every page it lists, including nested sitemaps. You choose which to add next.">
                <Input id="kb-sitemap-url" autoFocus value={sitemap} onChange={(e) => setSitemap(e.target.value)} placeholder="https://www.example.com/sitemap.xml" />
              </Field>
            )}
            {tab === "page" && (
              <Field label="Page" htmlFor="kb-page-url" hint="Read and added right away.">
                <Input id="kb-page-url" autoFocus value={page} onChange={(e) => setPage(e.target.value)} placeholder="https://www.example.com/pricing" />
              </Field>
            )}

            {tab !== "page" && (
              <div className="border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setMoreOpen((value) => !value)}
                  className="flex items-center gap-1.5 text-[14px] font-medium text-ink"
                  aria-expanded={moreOpen}
                >
                  <ChevronDown className={cn("size-4 text-muted transition-transform duration-200", moreOpen && "rotate-180")} />
                  More options
                  {rules.length > 0 && <span className="text-muted">· {rules.length} excluded</span>}
                </button>
                {moreOpen && (
                  <div className="mt-4 flex flex-col gap-5 animate-fade-in">
                    <Field label="Exclude paths">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={draft.match}
                          onValueChange={(value) => setDraft((current) => ({ ...current, match: value as Match }))}
                          options={MATCHES}
                          className="sm:w-[150px]"
                        />
                        <div className="flex h-10 flex-1 items-center overflow-hidden rounded-[10px] border border-line-strong bg-surface focus-within:border-accent">
                          <input
                            value={draft.value}
                            onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addRule();
                              }
                            }}
                            placeholder={draft.match === "wildcard" ? "/blog/*/comments" : "/blog"}
                            className="h-full min-w-0 flex-1 bg-transparent px-3 text-[14px] placeholder:text-faint focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={addRule}
                            disabled={!draft.value.trim()}
                            className="flex h-full items-center gap-1 border-l border-line px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2 disabled:text-faint"
                          >
                            <Plus className="size-4" /> Add
                          </button>
                        </div>
                      </div>
                      {rules.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {rules.map((rule, index) => (
                            <span key={index} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 py-1 pr-1 pl-2.5 text-[12.5px]">
                              <span className="text-muted">{MATCHES.find((match) => match.value === rule.match)?.label}</span>
                              <code className="font-mono text-[12px]">{rule.value}</code>
                              <button
                                type="button"
                                onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                                className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-ink"
                                aria-label={`Remove ${rule.value}`}
                              >
                                <X className="size-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </Field>
                    <OptionRow
                      title="Include query parameters"
                      description="Treat ?page=2 and similar as separate pages."
                      checked={includeQuery}
                      onChange={setIncludeQuery}
                    />
                    <OptionRow
                      title="Slow mode"
                      description="Reads one page every few seconds, for sites that can't take much traffic."
                      checked={slow}
                      onChange={setSlow}
                    />
                    <Field label="Maximum pages" htmlFor="kb-limit">
                      <Input
                        id="kb-limit"
                        type="number"
                        min={1}
                        max={10000}
                        value={limit}
                        onChange={(event) => setLimit(Math.min(10_000, Math.max(1, Number(event.target.value) || 1)))}
                        className="w-[140px]"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </SheetBody>

          <SheetFooter>
            <p className="text-[12.5px] text-muted">
              {tab === "page" ? "One page" : "Up to 10,000 pages per import"}
              {room !== null && ` · ${compact(room)} characters left on your plan`}
            </p>
            <Button type="submit" loading={loading} disabled={!target.trim()}>
              {tab === "page" ? "Add page" : "Find pages"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
