"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { actionImportPages, actionReadSitemap } from "@/server-actions/site-pages";
import { runAction } from "@/lib/run-action";
import { parsePageList } from "@/lib/site-map/pages";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { segmentedItem, segmentedTrack } from "@/components/ui/misc";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Tab = "paste" | "sitemap";

const TABS: { value: Tab; label: string }[] = [
  { value: "paste", label: "Paste links" },
  { value: "sitemap", label: "From a sitemap" },
];

const PREVIEW_ROWS = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const amount = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;

export function ImportPagesSheet({
  agentId,
  siteUrl,
  room,
  open,
  onOpenChange,
}: {
  agentId: string;
  siteUrl: string;
  // Pages the site map can still take.
  room: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [sitemap, setSitemap] = useState("");
  const [startsWith, setStartsWith] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Long lists (a whole sitemap) are read after typing settles.
  const deferredText = useDeferredValue(text);
  const parsed = useMemo(() => parsePageList(deferredText, siteUrl || null), [deferredText, siteUrl]);

  useEffect(() => {
    if (!open || !siteUrl) return;
    try {
      const guess = `${new URL(siteUrl).origin}/sitemap.xml`;
      setSitemap((current) => current || guess);
    } catch {
      // Not a full URL.
    }
  }, [open, siteUrl]);

  const append = (lines: string) => setText((current) => (current.trim() ? `${current.trimEnd()}\n${lines}` : lines));

  async function loadFile(files: FileList | null) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is larger than 5 MB.");
      return;
    }
    append(await file.text());
  }

  async function findPages() {
    setLoading(true);
    await runAction(() => actionReadSitemap(agentId, { url: sitemap, startsWith }), {
      onSuccess: (result) => {
        append(result.data.links.join("\n"));
        setTab("paste");
      },
    });
    setLoading(false);
  }

  async function addPages() {
    setLoading(true);
    await runAction(() => actionImportPages(agentId, { pages: parsed.pages, requiresAuth }), {
      onSuccess: (result) => {
        const { added, existing } = result.data;
        if (added === 0) toast.success("These pages are already in the site map");
        else toast.success(`Added ${amount(added, "page")}${existing ? `. ${amount(existing, "was", "were")} already there.` : ""}`);
        setText("");
        onOpenChange(false);
        router.refresh();
      },
    });
    setLoading(false);
  }

  const found = parsed.pages.length;
  const notes = [
    parsed.skipped > 0 && `${amount(parsed.skipped, "line")} without a link`,
    parsed.duplicates > 0 && `${amount(parsed.duplicates, "repeat")} left out`,
  ].filter(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (tab === "paste" ? addPages() : findPages());
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetHeader icon={<ListPlus />} title="Import pages" />
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
            {tab === "paste" ? (
              <>
                <Field label="Links" htmlFor="import-links" hint="One per line. Spreadsheet or CSV columns work too: name, link and description.">
                  <Textarea
                    id="import-links"
                    autoFocus
                    minRows={8}
                    maxRows={16}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={"/settings/billing\nhttps://app.example.com/integrations\nTeam, /settings/members, Invite people and change roles"}
                    className="font-mono text-[13px]"
                    spellCheck={false}
                  />
                </Field>
                <div className="-mt-2 flex items-center justify-between gap-3">
                  <p className="text-[12.5px] text-muted tabular">
                    {found > 0 && <span className="font-medium text-ink">{amount(found, "page")}</span>}
                    {found > 0 && notes.length > 0 && " · "}
                    {notes.join(" · ")}
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                    <FileUp /> Load a file
                  </Button>
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.md,text/csv,text/plain" className="hidden" onChange={(event) => void loadFile(event.target.files)} />
                </div>

                {found > 0 && (
                  <div className="overflow-hidden rounded-xl bg-surface-2">
                    {parsed.pages.slice(0, PREVIEW_ROWS).map((page) => (
                      <div key={page.path} className="flex items-baseline gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                        <span className="min-w-0 shrink-0 basis-[38%] truncate text-[13.5px] font-medium">{page.title}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">{page.path}</span>
                      </div>
                    ))}
                    {found > PREVIEW_ROWS && (
                      <p className="px-4 py-2.5 text-[12.5px] text-muted tabular">and {amount(found - PREVIEW_ROWS, "more page")}</p>
                    )}
                  </div>
                )}

                <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
                  <span className="text-[14px]">
                    <span className="font-medium">These pages need a login</span>
                    <span className="block text-[13px] text-muted">It mentions the login to visitors who aren’t signed in.</span>
                  </span>
                  <Switch checked={requiresAuth} onCheckedChange={setRequiresAuth} />
                </label>
              </>
            ) : (
              <>
                <Field label="Sitemap" htmlFor="import-sitemap" hint="Its pages go into the list for you to check before adding.">
                  <Input
                    id="import-sitemap"
                    autoFocus
                    value={sitemap}
                    onChange={(event) => setSitemap(event.target.value)}
                    placeholder="https://www.example.com/sitemap.xml"
                  />
                </Field>
                <Field label="Only paths starting with" htmlFor="import-prefix">
                  <Input
                    id="import-prefix"
                    value={startsWith}
                    onChange={(event) => setStartsWith(event.target.value)}
                    placeholder="/help"
                    className="font-mono text-[13.5px]"
                  />
                </Field>
              </>
            )}
          </SheetBody>

          <SheetFooter>
            <p className={cn("text-[12.5px] tabular", found > room ? "text-danger" : "text-muted")}>
              {room > 0 ? `Room for ${amount(room, "more page")}` : "The site map is full"}
            </p>
            {tab === "paste" ? (
              <Button type="submit" loading={loading} disabled={found === 0}>
                {found > 0 ? `Add ${amount(found, "page")}` : "Add pages"}
              </Button>
            ) : (
              <Button type="submit" loading={loading} disabled={!sitemap.trim()}>
                Find pages
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
