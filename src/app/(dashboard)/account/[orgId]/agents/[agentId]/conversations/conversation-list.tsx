"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Keyboard, LifeBuoy, Loader2, Mic, Search, ShieldCheck, X } from "lucide-react";
import { actionListConversations } from "@/server-actions/conversations";
import type { ConversationListItem } from "@/lib/conversations/list";
import { countryFlag, formatCallTime, visitorName, visitorSeed } from "@/lib/conversations/visitor";
import { MonsterAvatar } from "@/components/ui/monster-avatar";
import { cn } from "@/lib/utils";

const SENTIMENT = {
  positive: { dot: "bg-success", label: "Went well" },
  negative: { dot: "bg-danger", label: "Went badly" },
} as const;

function shortAgo(at: string) {
  return formatDistanceToNowStrict(new Date(at))
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

// "Today", "Yesterday", "Monday", "September 28". The server doesn't know the
// viewer's time zone, so the first render uses UTC and then switches to local.
function dayLabel(at: string, now: Date, timeZone: string | undefined) {
  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
  const day = (date: Date) => Date.parse(format(date, { year: "numeric", month: "2-digit", day: "2-digit" }));
  const date = new Date(at);
  const daysAgo = Math.round((day(now) - day(date)) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return format(date, { weekday: "long" });
  const sameYear = format(date, { year: "numeric" }) === format(now, { year: "numeric" });
  return format(date, { month: "long", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function groupByDay(items: ConversationListItem[], timeZone: string | undefined) {
  const now = new Date();
  const groups: { label: string; items: ConversationListItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at, now, timeZone);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-black/[0.045] px-1.5 py-[3px] text-[11.5px] leading-none font-medium text-ink-2 tabular [&_svg]:size-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ConversationRow({
  item,
  href,
  selected,
}: {
  item: ConversationListItem;
  href: string;
  // "desktop": open beside the list only on wide screens (the list page shows the newest).
  selected: boolean | "desktop";
}) {
  const flag = item.user_name || item.user_email ? countryFlag(item.country) : null;
  const sentiment = item.sentiment && item.sentiment !== "neutral" ? SENTIMENT[item.sentiment] : null;
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected === true ? "page" : undefined}
      className={cn(
        "flex gap-3 rounded-[14px] px-3 py-3 transition-[background-color,box-shadow] duration-150",
        selected === true
          ? "bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_8px_-3px_rgb(0_0_0/0.1)]"
          : selected === "desktop"
            ? "hover:bg-black/[0.035] lg:bg-surface lg:shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_8px_-3px_rgb(0_0_0/0.1)]"
            : "hover:bg-black/[0.035]",
      )}
    >
      <MonsterAvatar seed={visitorSeed(item)} size={36} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{item.title}</p>
          <time dateTime={item.at} className="shrink-0 text-[11.5px] text-faint tabular" suppressHydrationWarning>
            {shortAgo(item.at)}
          </time>
        </div>
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12.5px] text-muted">
          <span className="truncate">{visitorName(item)}</span>
          {item.user_verified && <ShieldCheck className="size-3.5 shrink-0 text-success-ink" aria-label="Signed in" />}
          {flag && <span aria-hidden>{flag}</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.used_voice && (
            <Chip>
              <Mic aria-label="Call" /> {item.voice_seconds > 0 ? formatCallTime(item.voice_seconds) : "Call"}
            </Chip>
          )}
          {item.used_text && (
            <Chip>
              <Keyboard aria-label="Chat" /> Chat
            </Chip>
          )}
          <Chip className="bg-transparent px-0.5 font-normal text-muted">{item.message_count} messages</Chip>
          {item.handoff && (
            <Chip className="bg-accent-soft text-accent-ink">
              <LifeBuoy /> Follow-up
            </Chip>
          )}
          {sentiment && (
            <span className="ml-auto flex items-center" title={sentiment.label}>
              <span className={cn("size-2 rounded-full", sentiment.dot)} aria-label={sentiment.label} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ConversationList({
  agentId,
  base,
  initial,
}: {
  agentId: string;
  base: string;
  initial: { items: ConversationListItem[]; hasMore: boolean };
}) {
  // The open conversation, or none on the list page (which shows the newest).
  const segment = useSelectedLayoutSegment();
  const selectedId = segment ?? initial.items[0]?.id ?? null;

  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [query, setQuery] = useState("");
  const [searching, startSearch] = useTransition();
  const [loadingMore, startLoadMore] = useTransition();
  const firstRender = useRef(true);
  const [timeZone, setTimeZone] = useState<string | undefined>("UTC");
  useEffect(() => setTimeZone(undefined), []);

  // New conversations arrive with each server render; keep them when not searching.
  useEffect(() => {
    if (query) return;
    setItems(initial.items);
    setHasMore(initial.hasMore);
  }, [initial, query]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => {
        const result = await actionListConversations(agentId, { query: query.trim() || undefined });
        if (result.ok) {
          setItems(result.data.items);
          setHasMore(result.data.hasMore);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [agentId, query]);

  const loadMore = () =>
    startLoadMore(async () => {
      const last = items[items.length - 1];
      if (!last) return;
      const result = await actionListConversations(agentId, { query: query.trim() || undefined, before: last.at });
      if (result.ok) {
        setItems((current) => [...current, ...result.data.items.filter((item) => !current.some((c) => c.id === item.id))]);
        setHasMore(result.data.hasMore);
      }
    });

  return (
    <aside
      className={cn(
        "min-h-0 flex-col border-line bg-zinc-50/80 lg:flex lg:w-[340px] lg:shrink-0 lg:rounded-bl-2xl lg:border-r xl:w-[364px]",
        segment ? "hidden" : "flex",
      )}
    >
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-[10px] bg-surface px-3 shadow-border transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_var(--color-accent)]">
          {searching ? <Loader2 className="size-4 shrink-0 animate-spin text-faint" /> : <Search className="size-4 shrink-0 text-faint" />}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-faint focus:outline-none"
            aria-label="Search conversations"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-faint hover:text-ink" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {items.length === 0 ? (
          <p className="px-3 py-10 text-center text-[13.5px] text-muted">No conversations match “{query}”.</p>
        ) : (
          <>
            {groupByDay(items, timeZone).map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="sticky top-0 z-[1] bg-zinc-50/95 px-3 pt-3 pb-1.5 text-[12px] font-medium text-muted backdrop-blur-sm">
                  {group.label}
                </h2>
                {/* pt-1: the selected card's outline sits outside it, under the sticky day heading otherwise. */}
                <div className="flex flex-col gap-0.5 pt-1">
                  {group.items.map((item) => (
                    <ConversationRow
                      key={item.id}
                      item={item}
                      href={`${base}/${item.id}`}
                      selected={item.id === selectedId && (segment ? true : "desktop")}
                    />
                  ))}
                </div>
              </section>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium text-muted transition-colors hover:bg-black/[0.035] hover:text-ink disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="size-3.5 animate-spin" />} Load older
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
