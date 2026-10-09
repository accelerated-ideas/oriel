"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ListPlus, Loader2, Lock, Map, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { actionDeleteMatchingPages, actionDeletePage, actionDeletePages, actionSavePage } from "@/server-actions/site-pages";
import { runAction } from "@/lib/run-action";
import type { SitePage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ImportPagesSheet } from "./import-pages-sheet";

const EXAMPLES = [
  { title: "Billing", path: "/settings/billing", description: "Change plan, update card, download invoices", requires_auth: true },
  { title: "Integrations", path: "/settings/integrations", description: "Connect Stripe, Slack and other tools", requires_auth: true },
  { title: "Pricing", path: "/pricing", description: "Plans and what's included", requires_auth: false },
];

const amount = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;

export function SiteMapBody({
  agentId,
  pages,
  total,
  matching,
  search,
  page,
  hasMore,
  limit,
  showLimit,
  siteUrl,
  navigateEnabled,
}: {
  agentId: string;
  // Loaded so far: the first `page` pages of results.
  pages: SitePage[];
  total: number;
  // Pages matching the search (all of them without one).
  matching: number;
  search: string;
  page: number;
  hasMore: boolean;
  limit: number;
  showLimit: boolean;
  siteUrl: string;
  navigateEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<Partial<SitePage> | null>(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Every matching page, beyond the ones loaded.
  const [everything, setEverything] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(search);
  const [navigating, startNavigation] = useTransition();

  // Selection only covers what's loaded.
  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => pages.some((item) => item.id === id))));
    setEverything(false);
  }, [pages]);

  const go = (next: { q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const q = next.q ?? search;
    if (q) params.set("q", q);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    startNavigation(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
  };

  // Search as you type, after a pause.
  useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => go({ q: query.trim() }), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (id: string) => {
    setEverything(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeCount = everything ? matching : selected.size;

  async function removeSelected() {
    setConfirming(false);
    setBusy(true);
    await runAction(() => (everything ? actionDeleteMatchingPages(agentId, search) : actionDeletePages(agentId, [...selected])), {
      success: `Removed ${amount(removeCount, "page")}`,
      onSuccess: () => {
        setSelected(new Set());
        setEverything(false);
        router.refresh();
      },
    });
    setBusy(false);
  }

  const allState = selected.size === 0 ? "off" : selected.size === pages.length ? "on" : "some";
  const room = Math.max(0, limit - total);

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tabular">
          {amount(total, "page")}
          {showLimit && <span className="font-normal text-muted"> of {limit.toLocaleString("en-US")}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <ListPlus /> Import
          </Button>
          <Button onClick={() => setEditing({})}>
            <Plus /> Add page
          </Button>
        </div>
      </div>

      {!navigateEnabled && total > 0 && (
        <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-[13.5px] text-accent-ink">
          Navigation is turned off in Actions, so it will describe these pages but won’t open them.
        </p>
      )}

      {total === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Map />}
          title="Map out your product"
          description="Add the pages people ask about most: settings, billing, integrations, key features."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setImporting(true)}>
                <ListPlus /> Import pages
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  for (const example of EXAMPLES) await actionSavePage(agentId, example);
                  router.refresh();
                }}
              >
                Start with examples
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mt-4 flex h-9 items-center gap-2 rounded-[10px] bg-surface px-3 shadow-border transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_var(--color-accent)] sm:w-[280px]">
            {navigating ? <Loader2 className="size-4 shrink-0 animate-spin text-faint" /> : <Search className="size-4 shrink-0 text-faint" />}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages"
              aria-label="Search pages"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-faint focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-faint hover:text-ink" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>

          {pages.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-zinc-50 px-5 py-10 text-center text-[14px] text-muted shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]">
              Nothing matches “{search}”.
            </p>
          ) : (
            <Card className="mt-3 overflow-hidden">
              <div className="flex h-12 items-center gap-2 border-b border-line bg-zinc-50/70 pr-4 pl-3">
                <Checkbox
                  state={allState}
                  label={allState === "on" ? "Deselect all" : "Select all shown"}
                  onClick={() => {
                    setEverything(false);
                    setSelected(allState === "on" ? new Set() : new Set(pages.map((item) => item.id)));
                  }}
                />
                {selected.size === 0 ? (
                  <span className="text-[13px] text-muted">Select all</span>
                ) : (
                  <div className="flex flex-1 flex-wrap items-center gap-1 animate-fade-in">
                    <span className="mr-2 text-[13px] font-medium tabular">{amount(removeCount, "page")} selected</span>
                    {allState === "on" && !everything && matching > pages.length && (
                      <Button size="sm" variant="ghost" onClick={() => setEverything(true)}>
                        Select all {matching.toLocaleString("en-US")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(true)} className="text-danger hover:text-danger">
                      <Trash2 /> Remove
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => {
                        setSelected(new Set());
                        setEverything(false);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-line">
                {pages.map((item) => (
                  <div
                    key={item.id}
                    className={cn("group flex items-center gap-3 py-3 pr-5 pl-3 transition-colors duration-150", selected.has(item.id) && "bg-accent-soft/40")}
                  >
                    <Checkbox state={selected.has(item.id) ? "on" : "off"} label={`Select ${item.title}`} onClick={() => toggle(item.id)} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(item)}>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium">{item.title}</span>
                        {item.requires_auth && (
                          <Badge tone="outline">
                            <Lock /> Login
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        <span className="font-mono text-[12.5px] text-ink-2">{item.path}</span>
                        {item.description && <> · {item.description}</>}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(item)} aria-label="Edit">
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete"
                        onClick={() => runAction(() => actionDeletePage(agentId, item.id), { onSuccess: () => router.refresh() })}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {pages.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted tabular">
              <span>
                {pages.length.toLocaleString("en-US")} of {matching.toLocaleString("en-US")}
              </span>
              {hasMore && (
                <Button variant="ghost" size="sm" onClick={() => go({ page: page + 1 })} loading={navigating}>
                  Show more
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <PageDialog agentId={agentId} page={editing} onClose={() => setEditing(null)} />
      <ImportPagesSheet agentId={agentId} siteUrl={siteUrl} room={room} open={importing} onOpenChange={setImporting} />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent size="sm">
          <DialogHeader
            title={`Remove ${amount(removeCount, "page")}?`}
            description="They're removed from the site map. Visitors are no longer taken to them."
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void removeSelected()}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageDialog({ agentId, page, onClose }: { agentId: string; page: Partial<SitePage> | null; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState({ title: "", path: "", description: "", requires_auth: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (page) {
      setValues({
        title: page.title ?? "",
        path: page.path ?? "",
        description: page.description ?? "",
        requires_auth: page.requires_auth ?? false,
      });
    }
  }, [page]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    await runAction(() => actionSavePage(agentId, { ...values, id: page?.id ?? null }), {
      onSuccess: () => {
        onClose();
        router.refresh();
      },
    });
    setLoading(false);
  }

  return (
    <Dialog open={page !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title={page?.id ? "Edit page" : "Add a page"} />
          <DialogBody className="flex flex-col gap-5">
            <Field label="Name" htmlFor="page-title">
              <Input
                id="page-title"
                autoFocus
                value={values.title}
                onChange={(e) => setValues({ ...values, title: e.target.value })}
                placeholder="Billing settings"
              />
            </Field>
            <Field label="Path or URL" htmlFor="page-path" hint="A path on your site, e.g. /settings/billing.">
              <Input
                id="page-path"
                value={values.path}
                onChange={(e) => setValues({ ...values, path: e.target.value })}
                placeholder="/settings/billing"
                className="font-mono text-[13.5px]"
              />
            </Field>
            <Field label="What's there" htmlFor="page-description" hint="What people can do on this page, in plain words.">
              <Textarea
                id="page-description"
                minRows={2}
                value={values.description}
                onChange={(e) => setValues({ ...values, description: e.target.value })}
                placeholder="Change plan, update card, download invoices"
              />
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-[14px]">
                <span className="font-medium">Requires login</span>
                <span className="block text-[13px] text-muted">It mentions the login to visitors who aren’t signed in.</span>
              </span>
              <Switch checked={values.requires_auth} onCheckedChange={(value) => setValues({ ...values, requires_auth: value })} />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!values.title.trim() || !values.path.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
