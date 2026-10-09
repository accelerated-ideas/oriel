"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircle,
  FileText,
  Globe,
  ListChecks,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  actionCancelImport,
  actionDeleteImportPages,
  actionDeleteSource,
  actionDeleteSources,
  actionRefreshImport,
  actionRefreshSources,
  actionSaveTextSource,
  actionSetPinned,
  actionUploadFiles,
} from "@/server-actions/knowledge";
import { runAction } from "@/lib/run-action";
import type { KnowledgeImport, KnowledgeSource } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState, segmentedItem, segmentedTrack } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { AddWebsiteSheet } from "./add-website-sheet";
import { ChoosePagesSheet } from "./choose-pages-sheet";

type Source = Pick<
  KnowledgeSource,
  | "id"
  | "kind"
  | "title"
  | "url"
  | "file_name"
  | "status"
  | "error"
  | "char_count"
  | "chunk_count"
  | "updated_at"
  | "created_at"
  | "fetched_at"
  | "content"
  | "rendered"
  | "always_include"
>;

export type SourceFilter = "all" | "website" | "file" | "note" | "pinned" | "failed";

// How often pages may be re-read (the plan's refresh rules).
export type RefreshPolicy = { everyHours: number; autoDays: number | null };

const FILTER_LABELS: Record<SourceFilter, string> = {
  all: "All",
  website: "Websites",
  file: "Files",
  note: "Notes",
  pinned: "Pinned",
  failed: "Failed",
};

const KIND_ICON = { url: Globe, file: FileText, text: NotebookPen } as const;

const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const PINNED_LIMIT = 30_000;

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function every(hours: number) {
  if (hours <= 1) return "once an hour";
  if (hours < 24) return `every ${hours} hours`;
  if (hours === 24) return "once a day";
  if (hours === 24 * 7) return "once a week";
  return `every ${Math.round(hours / 24)} days`;
}

function refreshSummary(policy: RefreshPolicy) {
  const manual = policy.everyHours > 0 ? `Pages can be read again ${every(policy.everyHours)}` : "Pages can be read again any time";
  const automatic = policy.autoDays
    ? `, and your site is re-read for you ${policy.autoDays === 1 ? "every day" : policy.autoDays === 7 ? "every week" : `every ${policy.autoDays} days`}.`
    : ". Automatic refresh isn't on your plan.";
  return manual + automatic;
}

// When a page can be read again, or null if it can now.
function refreshableAt(source: Source, policy: RefreshPolicy) {
  if (source.kind !== "url" || source.status === "error" || policy.everyHours === 0) return null;
  const at = new Date(source.fetched_at ?? source.created_at).getTime() + policy.everyHours * 3_600_000;
  return at > Date.now() ? at : null;
}

function reportRefresh(result: { queued: number; skipped: number; nextAt: string | null }) {
  const wait = result.nextAt ? formatDistanceToNowStrict(new Date(result.nextAt)) : null;
  if (result.queued === 0) {
    toast.message(wait ? `These pages were read recently. They can be read again in ${wait}.` : "Nothing to read again.");
    return;
  }
  const skipped = result.skipped > 0 && wait ? ` ${result.skipped.toLocaleString("en-US")} read recently can be refreshed in ${wait}.` : "";
  toast.success(`Reading ${result.queued.toLocaleString("en-US")} ${result.queued === 1 ? "page" : "pages"} again.${skipped}`);
}

function Bar({ share, tone = "bg-accent", pulsing }: { share: number; tone?: string; pulsing?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone, pulsing && "animate-pulse")}
        style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

export function KnowledgeBody({
  agentId,
  siteUrl,
  sources,
  total,
  hasMore,
  page,
  filter,
  search,
  imports,
  size,
  policy,
  room,
}: {
  agentId: string;
  siteUrl: string;
  sources: Source[];
  total: number;
  hasMore: boolean;
  page: number;
  filter: SourceFilter;
  search: string;
  imports: KnowledgeImport[];
  size: { assistant: number; pinned: number; workspace: number | null; limit: number | null };
  policy: RefreshPolicy;
  room: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [panel, setPanel] = useState<"website" | "note" | null>(null);
  const [editing, setEditing] = useState<Source | null>(null);
  const [removing, setRemoving] = useState<KnowledgeImport | null>(null);
  const [choosing, setChoosing] = useState<KnowledgeImport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState(search);
  const [navigating, startNavigation] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const activeImports = imports.filter((item) => item.status === "finding" || item.status === "reading");
  const working = activeImports.length > 0 || sources.some((source) => source.status === "pending" || source.status === "processing");
  const filtered = filter !== "all" || search !== "";

  // Refresh while there's work in progress.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [working, router]);

  // Selection only covers what's on screen.
  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => sources.some((source) => source.id === id))));
  }, [sources]);

  const go = (next: { type?: SourceFilter; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const type = next.type ?? filter;
    const q = next.q ?? search;
    if (type !== "all") params.set("type", type);
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

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const form = new FormData();
    form.set("agentId", agentId);
    Array.from(files).forEach((file) => form.append("files", file));
    setUploading(true);
    await runAction(() => actionUploadFiles(form), {
      onSuccess: (result) => {
        if (result.data.failed.length > 0) toast.error(result.data.failed.join("\n"));
        else toast.success(files.length === 1 ? "File added" : `${files.length} files added`);
        router.refresh();
      },
    });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const refresh = async (sourceIds: string[]) => {
    setBusy(true);
    await runAction(() => actionRefreshSources({ agentId, sourceIds }), {
      onSuccess: (result) => {
        reportRefresh(result.data);
        setSelected(new Set());
        router.refresh();
      },
    });
    setBusy(false);
  };

  const removeSelected = async () => {
    setBusy(true);
    const count = selected.size;
    await runAction(() => actionDeleteSources({ agentId, sourceIds: [...selected] }), {
      success: `Removed ${count} ${count === 1 ? "source" : "sources"}`,
      onSuccess: () => {
        setSelected(new Set());
        router.refresh();
      },
    });
    setBusy(false);
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allState = selected.size === 0 ? "off" : selected.size === sources.length ? "on" : "some";
  const empty = total === 0 && !filtered && imports.length === 0;

  return (
    <div className="mt-10">
      <div className="grid gap-3 sm:grid-cols-3">
        <AddTile icon={<Globe />} title="Website" description="Crawl a site, a sitemap or one page" onClick={() => setPanel("website")} />
        <AddTile
          icon={uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          title="Files"
          description="PDF, Word, Markdown, text or CSV"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        />
        <AddTile icon={<NotebookPen />} title="Note" description="Write or paste anything it should know" onClick={() => setPanel("note")} />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.html,.htm"
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
        />
      </div>

      {imports.length > 0 && (
        <Card className="mt-8 divide-y divide-line overflow-hidden">
          {imports.map((item) => (
            <ImportRow
              key={item.id}
              item={item}
              onChoose={() => setChoosing(item)}
              onRefresh={() =>
                runAction(() => actionRefreshImport({ agentId, importId: item.id }), {
                  onSuccess: (result) => {
                    reportRefresh(result.data);
                    router.refresh();
                  },
                })
              }
              onStop={() =>
                runAction(() => actionCancelImport(agentId, item.id), { success: "Import stopped", onSuccess: () => router.refresh() })
              }
              onRemove={() => setRemoving(item)}
            />
          ))}
        </Card>
      )}

      {empty ? (
        <EmptyState
          className="mt-8"
          icon={<NotebookPen />}
          title="Nothing here yet"
          description="Start with your website, help center or docs. The more it knows, the fewer questions end in “I'm not sure.”"
          action={
            siteUrl ? (
              <Button variant="outline" onClick={() => setPanel("website")}>
                Import {new URL(siteUrl).hostname}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mt-10 flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">Sources</h2>
                <p className="mt-0.5 text-[13px] text-muted tabular">
                  {compact(size.assistant)} characters
                  {size.pinned > 0 && ` · ${compact(size.pinned)} of ${compact(PINNED_LIMIT)} pinned`}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">{refreshSummary(policy)}</p>
              </div>
              {size.limit !== null && size.workspace !== null && (
                <div className="w-full max-w-[280px]">
                  <p className="mb-1.5 flex justify-between text-[12.5px] text-muted tabular">
                    <span>Workspace knowledge</span>
                    <span>
                      <span className="font-medium text-ink">{compact(size.workspace)}</span> of {compact(size.limit)}
                    </span>
                  </p>
                  <Bar share={size.limit ? size.workspace / size.limit : 1} tone={size.workspace >= size.limit ? "bg-danger" : "bg-accent"} />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className={segmentedTrack} role="tablist" aria-label="Show">
                {(Object.keys(FILTER_LABELS) as SourceFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    onClick={() => go({ type: value })}
                    className={segmentedItem(filter === value)}
                  >
                    {FILTER_LABELS[value]}
                  </button>
                ))}
              </div>
              <div className="flex h-9 items-center gap-2 rounded-[10px] bg-surface px-3 shadow-border transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_var(--color-accent)] sm:w-[240px]">
                {navigating ? <Loader2 className="size-4 shrink-0 animate-spin text-faint" /> : <Search className="size-4 shrink-0 text-faint" />}
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search sources"
                  aria-label="Search sources"
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-faint focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="text-faint hover:text-ink" aria-label="Clear search">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {sources.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-zinc-50 px-5 py-10 text-center text-[14px] text-muted shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]">
              {search ? `Nothing matches “${search}”.` : "Nothing here."}
            </p>
          ) : (
            <Card className="mt-3 overflow-hidden">
              <div className="flex h-12 items-center gap-2 border-b border-line bg-zinc-50/70 pr-4 pl-3">
                <Checkbox
                  state={allState}
                  label={allState === "on" ? "Deselect all" : "Select all on this page"}
                  onClick={() => setSelected(allState === "on" ? new Set() : new Set(sources.map((source) => source.id)))}
                />
                {selected.size === 0 ? (
                  <span className="text-[13px] text-muted">Select all</span>
                ) : (
                  <div className="flex flex-1 items-center gap-1 animate-fade-in">
                    <span className="mr-2 text-[13px] font-medium tabular">{selected.size} selected</span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh([...selected])}>
                      <RefreshCw /> Read again
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeSelected()} className="text-danger hover:text-danger">
                      <Trash2 /> Remove
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-line">
                {sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    selected={selected.has(source.id)}
                    onToggle={() => toggle(source.id)}
                    readAgainAt={refreshableAt(source, policy)}
                    onEdit={() => setEditing(source)}
                    onRefresh={() => void refresh([source.id])}
                    onPin={(pinned) =>
                      runAction(() => actionSetPinned(agentId, source.id, pinned), {
                        success: pinned ? "Pinned: it's in every reply now" : "Unpinned",
                        onSuccess: () => router.refresh(),
                      })
                    }
                    onRemove={() =>
                      runAction(() => actionDeleteSource(agentId, source.id), { success: "Removed", onSuccess: () => router.refresh() })
                    }
                  />
                ))}
              </div>
            </Card>
          )}
          <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted tabular">
            <span>
              {sources.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
            </span>
            {hasMore && (
              <Button variant="ghost" size="sm" onClick={() => go({ page: page + 1 })} loading={navigating}>
                Show more
              </Button>
            )}
          </div>
        </>
      )}

      <AddWebsiteSheet agentId={agentId} defaultUrl={siteUrl} room={room} open={panel === "website"} onOpenChange={(open) => setPanel(open ? "website" : null)} />
      <ChoosePagesSheet
        agentId={agentId}
        importId={choosing?.id ?? null}
        site={choosing ? shortUrl(choosing.url) : ""}
        open={choosing !== null}
        onOpenChange={(open) => !open && setChoosing(null)}
      />
      <NoteDialog
        agentId={agentId}
        source={editing}
        open={panel === "note" || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPanel(null);
            setEditing(null);
          }
        }}
      />
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent size="sm">
          <DialogHeader
            title="Remove these pages?"
            description={removing ? `Every page imported from ${shortUrl(removing.url)} will be removed from knowledge.` : undefined}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const item = removing;
                setRemoving(null);
                if (item) {
                  await runAction(() => actionDeleteImportPages(agentId, item.id), {
                    success: "Pages removed",
                    onSuccess: () => router.refresh(),
                  });
                }
              }}
            >
              Remove pages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportRow({
  item,
  onChoose,
  onRefresh,
  onStop,
  onRemove,
}: {
  item: KnowledgeImport;
  onChoose: () => void;
  onRefresh: () => void;
  onStop: () => void;
  onRemove: () => void;
}) {
  const active = item.status === "finding" || item.status === "reading";
  const read = item.ready + item.failed;
  const added = read + item.waiting;
  const summary =
    item.status === "finding"
      ? "Finding pages…"
      : item.status === "found"
        ? `${item.pages_found.toLocaleString("en-US")} pages found`
        : item.status === "reading"
          ? `Reading ${read.toLocaleString("en-US")} of ${added.toLocaleString("en-US")} pages`
          : item.status === "failed"
            ? item.error ?? "The import stopped."
            : item.status === "canceled"
              ? `Stopped · ${item.ready.toLocaleString("en-US")} pages read`
              : `${item.ready.toLocaleString("en-US")} pages`;
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        {active ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">
          {shortUrl(item.url)}
          {item.mode === "sitemap" && <span className="ml-1.5 font-normal text-muted">sitemap</span>}
        </p>
        <p className={cn("truncate text-[12.5px]", item.status === "failed" ? "text-danger" : "text-muted")}>
          {summary}
          {item.failed > 0 && item.status !== "failed" && ` · ${item.failed.toLocaleString("en-US")} couldn't be read`}
          {item.unchosen > 0 && item.status !== "found" && ` · ${item.unchosen.toLocaleString("en-US")} not added`}
          {!active && item.status !== "found" && item.finished_at && ` · ${formatDistanceToNowStrict(new Date(item.finished_at), { addSuffix: true })}`}
        </p>
        {active && (
          <div className="mt-2 max-w-[360px]">
            <Bar share={added ? read / added : 0} pulsing={item.status === "finding"} />
          </div>
        )}
      </div>
      {item.status === "found" && (
        <Button size="sm" onClick={onChoose}>
          <ListChecks /> Choose pages
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-ink" aria-label="Import options">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.unchosen > 0 && item.status !== "found" && (
            <DropdownMenuItem onSelect={onChoose}>
              <ListChecks /> Choose more pages
            </DropdownMenuItem>
          )}
          {added > 0 && !active && (
            <DropdownMenuItem onSelect={onRefresh}>
              <RefreshCw /> Read all pages again
            </DropdownMenuItem>
          )}
          {(active || item.status === "found") && (
            <DropdownMenuItem onSelect={onStop}>
              <Square /> Stop importing
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onSelect={onRemove}>
            <Trash2 /> Remove its pages
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SourceRow({
  source,
  selected,
  onToggle,
  readAgainAt,
  onEdit,
  onRefresh,
  onPin,
  onRemove,
}: {
  source: Source;
  selected: boolean;
  onToggle: () => void;
  // When this page can be read again on the plan, or null if now.
  readAgainAt: number | null;
  onEdit: () => void;
  onRefresh: () => void;
  onPin: (pinned: boolean) => void;
  onRemove: () => void;
}) {
  const Icon = KIND_ICON[source.kind];
  const detail =
    source.status === "error"
      ? source.error
      : source.kind === "url"
        ? `${shortUrl(source.url ?? "")}${source.rendered ? " · read with a browser" : ""}`
        : source.kind === "file"
          ? source.file_name
          : `${source.char_count.toLocaleString("en-US")} characters`;
  const canReadAgain = source.kind === "url" || source.status === "error";
  return (
    <div className={cn("flex items-center gap-3 py-3 pr-5 pl-3 transition-colors duration-150", selected && "bg-accent-soft/40")}>
      <Checkbox state={selected ? "on" : "off"} label={`Select ${source.title}`} onClick={onToggle} />
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
        <Icon className="size-4" />
      </div>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => (source.kind === "text" ? onEdit() : onToggle())}
      >
        <p className="flex items-center gap-1.5 truncate text-[14px] font-medium">
          {source.always_include && <Pin className="size-3.5 shrink-0 text-accent" aria-label="Pinned" />}
          <span className="truncate">{source.title}</span>
        </p>
        <p className={cn("truncate text-[12.5px]", source.status === "error" ? "text-danger" : "text-muted")}>{detail}</p>
      </button>
      <StatusBadge status={source.status} />
      <span className="hidden w-24 text-right text-[12.5px] text-muted sm:block">
        {formatDistanceToNowStrict(new Date(source.fetched_at ?? source.updated_at), { addSuffix: true })}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-ink" aria-label="More">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          {source.kind === "text" && (
            <DropdownMenuItem onSelect={onEdit}>
              <NotebookPen /> Edit
            </DropdownMenuItem>
          )}
          {source.status === "ready" && (
            <DropdownMenuItem onSelect={() => onPin(!source.always_include)}>
              {source.always_include ? <PinOff /> : <Pin />} {source.always_include ? "Unpin" : "Pin to every reply"}
            </DropdownMenuItem>
          )}
          {canReadAgain && (
            <DropdownMenuItem onSelect={onRefresh} disabled={readAgainAt !== null}>
              <RefreshCw /> Read again
              {readAgainAt !== null && (
                <span className="ml-auto pl-3 text-[12px] text-muted">in {formatDistanceToNowStrict(new Date(readAgainAt))}</span>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onSelect={onRemove}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AddTile({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3.5 rounded-2xl bg-surface p-4 text-left shadow-border transition-[box-shadow,scale] duration-150 ease-out hover:shadow-pop active:scale-[0.98] disabled:opacity-60 [&_svg]:size-[18px]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{icon}</span>
      <span>
        <span className="block text-[14.5px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span>
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: Source["status"] }) {
  if (status === "ready") return <Badge tone="success">Ready</Badge>;
  if (status === "error")
    return (
      <Badge tone="danger">
        <AlertCircle /> Failed
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <Loader2 className="animate-spin" /> {status === "pending" ? "Queued" : "Reading"}
    </Badge>
  );
}

function NoteDialog({
  agentId,
  source,
  open,
  onOpenChange,
}: {
  agentId: string;
  source: Source | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(source?.title ?? "");
      setContent(source?.content ?? "");
    }
  }, [open, source]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    await runAction(() => actionSaveTextSource({ agentId, sourceId: source?.id ?? null, title, content }), {
      success: source ? "Note updated" : "Note added",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title={source ? "Edit note" : "New note"} />
          <DialogBody className="flex flex-col gap-5">
            <Field label="Title" htmlFor="note-title">
              <Input id="note-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Refund policy" />
            </Field>
            <Field label="Content" htmlFor="note-content">
              <Textarea
                id="note-content"
                minRows={10}
                maxRows={22}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Refunds are available within 30 days of purchase…"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!title.trim() || content.trim().length < 10}>
              Save note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
