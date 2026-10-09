"use client";
import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  CalendarX2,
  Check,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Monitor,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Webhook,
  X,
} from "lucide-react";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/dashboard/logo";
import { StripeMark } from "@/components/brand/stripe-logo";
import { cn } from "@/lib/utils";
import { Backdrop, type PaletteName } from "./backdrop";
import {
  EASE_OUT,
  Reveal,
  RevealGroup,
  RevealItem,
  useScene,
  wordsAt,
} from "./motion";

// Each safeguard is a tile with a small looping scene that shows it working:
// the same request from a stranger and a signed-in customer, an action that
// waits for a clear yes, a key that never reaches the browser, and so on.
export function Safety() {
  return (
    <section className="px-3 py-24 sm:px-5 sm:py-32">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <h2 className="headline max-w-[640px] text-[40px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[60px]">
            Careful with your customers
          </h2>
        </Reveal>
        <Reveal delay={0.05}>
          <p className="max-w-[420px] text-[17px] leading-relaxed text-pretty text-muted lg:pb-1.5">
            It talks to real people about their real accounts. Here&apos;s what
            keeps that safe.
          </p>
        </Reveal>
      </div>

      <RevealGroup
        className="mt-12 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:mt-16 lg:grid-cols-3"
        stagger={0.07}
      >
        <Tile
          className="md:col-span-2"
          title="Knows who it's talking to"
          palette="sky"
          text="Your server signs who's logged in. Anonymous visitors can ask anything, but can't touch an account."
          art={<IdentityArt />}
        />
        <Tile
          title="Asks before it acts"
          palette="amber"
          frame={3000}
          text="Choose which actions need a yes. It says exactly what will happen, then waits for a clear one."
          art={<ConfirmArt />}
        />
        <Tile
          title="Only their own billing"
          palette="stripe"
          frame={6000}
          text="Actions are locked to the signed-in customer, so nobody sees anyone else's invoices."
          art={<ScopeArt />}
        />
        <Tile
          dark
          title="Secrets stay secret"
          palette="night"
          frame={9000}
          text="API keys and headers are encrypted at rest and only ever used on our servers."
          art={<SecretsArt />}
        />
        <Tile
          title="Only on your sites"
          palette="mint"
          frame={12000}
          text="Limit it to your own domains, so nobody else can put your assistant on their page."
          art={<DomainsArt />}
        />
        <Tile
          wide
          className="md:col-span-2 lg:col-span-3"
          title="Knows when to step back"
          palette="coral"
          frame={15000}
          text="When it can't help, it hands off to your team by email or webhook, with the whole story, so nobody has to ask twice."
          art={<HandoffArt />}
        />
      </RevealGroup>
    </section>
  );
}

function Tile({
  title,
  text,
  art,
  palette,
  frame = 0,
  dark = false,
  wide = false,
  className,
}: {
  title: string;
  text: string;
  art: React.ReactNode;
  palette: PaletteName;
  /** Where its colour starts moving, so neighbours don't look alike. */
  frame?: number;
  dark?: boolean;
  /** Text beside the scene on the widest screens, instead of under it. */
  wide?: boolean;
  className?: string;
}) {
  return (
    <RevealItem
      className={cn(
        "flex flex-col rounded-[22px] p-2 sm:rounded-[28px]",
        dark
          ? "bg-[#161411] text-white shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_24px_48px_-24px_rgb(20_15_5/0.5)]"
          : "bg-surface shadow-border",
        wide && "xl:grid xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]",
        className,
      )}
    >
      {/* The scene shows what the text says, and changes many times a second. */}
      <div
        aria-hidden
        className={cn(
          "relative isolate overflow-hidden rounded-[16px] sm:rounded-[20px] md:h-[300px]",
          dark ? "bg-[#1b1442]" : "bg-[#ebe6dc]",
          wide && "xl:order-2 xl:h-[320px]",
        )}
      >
        <Backdrop
          palette={palette}
          dark={dark}
          frame={frame}
          speed={0.25}
          className="-z-10"
        />
        {/* A soft inner edge, like the card is a window onto the colour. */}
        <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06),inset_0_1px_0_rgb(255_255_255/0.25)]" />
        {art}
      </div>
      <div
        className={cn(
          "px-4 pt-5 pb-5 sm:px-5 sm:pb-6",
          wide && "xl:order-1 xl:flex xl:flex-col xl:justify-center xl:p-8",
        )}
      >
        <h3 className="headline text-[22px] leading-tight font-semibold tracking-[-0.025em]">
          {title}
        </h3>
        <p
          className={cn(
            "mt-2.5 max-w-[440px] text-[16px] leading-relaxed text-pretty",
            dark ? "text-white/60" : "text-muted",
          )}
        >
          {text}
        </p>
      </div>
    </RevealItem>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces

const PANEL =
  "rounded-[16px] bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_2px_4px_-1px_rgb(0_0_0/0.05),0_18px_36px_-14px_rgb(60_45_20/0.25)]";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const progress = (time: number, [from, to]: readonly [number, number]) =>
  clamp01((time - from) / (to - from));
// Everything scripted fades out before a scene starts over.
const fadeOut = (time: number, from: number, loop: number) =>
  time < from ? 1 : clamp01(1 - (time - from) / (loop - from));

function Bubble({
  role,
  pending,
  children,
}: {
  role: "user" | "assistant";
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout="position"
      className={cn("flex", role === "user" ? "justify-end pl-8" : "pr-6")}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      <p
        className={cn(
          "px-3 py-[7px] text-[12.5px] leading-[1.45] transition-opacity duration-200",
          role === "user"
            ? "rounded-[15px] rounded-br-[5px] bg-accent text-white"
            : "rounded-[15px] rounded-bl-[5px] bg-zinc-100 text-zinc-900",
          pending && "opacity-55",
        )}
      >
        {children}
      </p>
    </motion.div>
  );
}

// A line in the transcript for something it did, like the real widget shows.
function Activity({
  icon,
  muted,
  children,
}: {
  icon: React.ReactNode;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout="position"
      className="flex justify-center"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]",
          muted ? "bg-zinc-100 text-zinc-500" : "bg-zinc-50 text-zinc-500",
        )}
      >
        {icon}
        {children}
      </span>
    </motion.div>
  );
}

// Messages pinned to the bottom, with older ones fading out at the top.
function Thread({
  fade,
  className,
  children,
}: {
  fade: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={cn(
        "flex flex-col justify-end gap-2 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_20px)]",
        className,
      )}
      animate={{ opacity: fade }}
      transition={{ duration: 0.1 }}
    >
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </motion.div>
  );
}

function Swap({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
          className,
        )}
        initial={{ opacity: 0, scale: 0.6, filter: "blur(3px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.6, filter: "blur(3px)" }}
        transition={{ type: "spring", duration: 0.35, bounce: 0 }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// The same question from a stranger and from a signed-in customer.

const IDENTITY = {
  loop: 9.4,
  still: 6.4,
  ask: [0.5, 1.5],
  tool: 2.1,
  reply: [2.7, 4.6],
  fade: 8.7,
} as const;

function IdentityArt() {
  const { ref, time } = useScene<HTMLDivElement>(IDENTITY.loop, IDENTITY.still);
  return (
    <div
      ref={ref}
      className="grid h-full grid-cols-1 content-center gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:px-10"
    >
      <Visitor time={time} signedIn={false} />
      <Visitor time={time} signedIn />
    </div>
  );
}

function Visitor({ time, signedIn }: { time: number; signedIn: boolean }) {
  const T = IDENTITY;
  const ask = wordsAt("What did I pay last month?", T.ask[0], T.ask[1], time);
  const reply = wordsAt(
    signedIn
      ? "$49 for Pro, paid on October 1 with your Visa ending 4242."
      : "I can't see account details until you're signed in. Want me to take you to the login page?",
    T.reply[0],
    T.reply[1],
    time,
  );

  return (
    <div className={cn(PANEL, "mx-auto w-full max-w-[340px] p-3.5")}>
      <div className="flex items-center gap-2.5">
        {signedIn ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-800">
            MC
          </span>
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-400">
            <UserRound className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">
            {signedIn ? "Maya Chen" : "Visitor"}
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {signedIn ? "maya@northwind.co" : "Not signed in"}
          </p>
        </div>
        {signedIn ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <ShieldCheck className="size-3.5" /> Verified
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
            Anonymous
          </span>
        )}
      </div>
      <Thread
        fade={fadeOut(time, T.fade, T.loop)}
        className="mt-3 h-[168px] border-t border-zinc-100 pt-3"
      >
        {ask && (
          <Bubble key="ask" role="user" pending={time < T.ask[1] + 0.3}>
            {ask}
          </Bubble>
        )}
        {time >= T.tool &&
          (signedIn ? (
            <Activity
              key="tool"
              icon={<Sparkles className="size-3 text-accent" />}
            >
              List invoices
            </Activity>
          ) : (
            <Activity key="tool" muted icon={<Lock className="size-3" />}>
              Account actions locked
            </Activity>
          ))}
        {reply && (
          <Bubble key="reply" role="assistant">
            {reply}
          </Bubble>
        )}
      </Thread>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Wait" isn't a yes, so nothing runs.

const CONFIRM = {
  loop: 9,
  still: 6.8,
  ask: [0.3, 1.1],
  check: [1.6, 3.4],
  wait: [3.9, 4.6],
  stopped: 4.9,
  fine: [5.3, 6.3],
  fade: 8.4,
} as const;

function ConfirmArt() {
  const T = CONFIRM;
  const { ref, time } = useScene<HTMLDivElement>(T.loop, T.still);
  const ask = wordsAt("Cancel my subscription.", T.ask[0], T.ask[1], time);
  const check = wordsAt(
    "That ends your Pro plan on November 1. Should I go ahead?",
    T.check[0],
    T.check[1],
    time,
  );
  const wait = wordsAt("Hmm, wait. Not yet.", T.wait[0], T.wait[1], time);
  const fine = wordsAt(
    "No problem. Nothing has changed.",
    T.fine[0],
    T.fine[1],
    time,
  );
  const stopped = time >= T.stopped && time < T.fade + 0.3;

  return (
    <div
      ref={ref}
      className="flex h-full flex-col justify-center gap-3 p-4 sm:p-5"
    >
      <div className={cn(PANEL, "flex items-center gap-3 p-3")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-red-50 text-red-600">
          <CalendarX2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">
            Cancel subscription
          </p>
          <p className="truncate font-mono text-[10.5px] text-zinc-500">
            needs a yes
          </p>
        </div>
        {stopped ? (
          <Swap id="stopped" className="bg-zinc-100 text-zinc-600">
            <X className="size-3" /> Not run
          </Swap>
        ) : (
          <Swap id="waiting" className="bg-amber-50 text-amber-800">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:animate-none" />
              <span className="relative size-1.5 rounded-full bg-amber-500" />
            </span>
            Waiting for a yes
          </Swap>
        )}
      </div>
      <Thread fade={fadeOut(time, T.fade, T.loop)} className="h-[176px]">
        {ask && (
          <Bubble key="ask" role="user" pending={time < T.ask[1] + 0.3}>
            {ask}
          </Bubble>
        )}
        {check && (
          <Bubble key="check" role="assistant">
            {check}
          </Bubble>
        )}
        {wait && (
          <Bubble key="wait" role="user" pending={time < T.wait[1] + 0.3}>
            {wait}
          </Bubble>
        )}
        {fine && (
          <Bubble key="fine" role="assistant">
            {fine}
          </Bubble>
        )}
      </Thread>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Everyone else's billing is out of reach.

const CUSTOMERS = [
  { name: "Jordan Lee", tone: "bg-sky-100 text-sky-800", amount: "$1,240.00" },
  {
    name: "Maya Chen",
    tone: "bg-amber-100 text-amber-800",
    amount: "$49.00",
    self: true,
  },
  { name: "Priya Shah", tone: "bg-rose-100 text-rose-800", amount: "$310.00" },
  {
    name: "Tom Becker",
    tone: "bg-emerald-100 text-emerald-800",
    amount: "$98.00",
  },
];

const SCOPE = {
  loop: 9.4,
  still: 7,
  lock: 0.6,
  scoped: 1.8,
  ask: [2.6, 3.6],
  reply: [4.2, 5.4],
  fade: 8.8,
} as const;

function ScopeArt() {
  const T = SCOPE;
  const { ref, time } = useScene<HTMLDivElement>(T.loop, T.still);
  const ask = wordsAt("Show me Jordan's invoices.", T.ask[0], T.ask[1], time);
  const reply = wordsAt(
    "I can only see your own account.",
    T.reply[0],
    T.reply[1],
    time,
  );

  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-2.5 p-4">
      <div className={cn(PANEL, "shrink-0 overflow-hidden")}>
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
          <span className="grid size-[22px] place-items-center rounded-[6px] bg-[#635bff]">
            <StripeMark className="size-[12px] text-white" />
          </span>
          <span className="text-[12.5px] font-semibold">Customers</span>
          <motion.span
            className="ml-auto flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink"
            initial={false}
            animate={{
              opacity: time >= T.scoped ? 1 : 0,
              scale: time >= T.scoped ? 1 : 0.8,
            }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            <Lock className="size-3" /> Maya Chen only
          </motion.span>
        </div>
        {CUSTOMERS.map((customer, index) => {
          const locked = !customer.self && time >= T.lock + index * 0.22;
          return (
            <div
              key={customer.name}
              className={cn(
                "relative flex items-center gap-2.5 px-3 py-[6px] text-[12px] transition-colors duration-300",
                customer.self && time >= T.lock && "bg-accent-soft/40",
              )}
            >
              {customer.self && (
                <span
                  className={cn(
                    "absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-accent transition-opacity duration-300",
                    time >= T.lock ? "opacity-100" : "opacity-0",
                  )}
                />
              )}
              <span
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full text-[9.5px] font-semibold transition-[filter,opacity] duration-500",
                  customer.tone,
                  locked && "opacity-60 blur-[1.5px]",
                )}
              >
                {customer.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span
                className={cn(
                  "flex-1 font-medium transition-[filter,opacity] duration-500",
                  locked && "opacity-50 blur-[2.5px]",
                )}
              >
                {customer.name}
              </span>
              {locked ? (
                <Lock className="size-3.5 text-zinc-400" />
              ) : (
                <span className="text-zinc-500 tabular">{customer.amount}</span>
              )}
            </div>
          );
        })}
      </div>
      <Thread
        fade={fadeOut(time, T.fade, T.loop)}
        className="h-[76px] shrink-0"
      >
        {ask && (
          <Bubble key="ask" role="user" pending={time < T.ask[1] + 0.3}>
            {ask}
          </Bubble>
        )}
        {reply && (
          <Bubble key="reply" role="assistant">
            {reply}
          </Bubble>
        )}
      </Thread>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The key is typed in once and encrypted. The visitor's browser never gets
// it; our server decrypts it only to call the customer's API.

const PLAIN = "Bearer sk_live_51NzQkL8e2RfTq";
// What's stored (AES-256-GCM, as v1.iv.tag.ciphertext), cut to the same length.
const CIPHER = "v1.mJ2f9QeX0bWn.Kc8yT1LwRz4Vq";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SEARCH = "sk_live";
const SECRETS = {
  loop: 10.5,
  still: 7.5,
  type: [0.3, 1.7],
  scramble: [2, 3.2],
  locked: 3.3,
  split: 3.6,
  search: [4.1, 4.9],
  found: 5.2,
  call: 4.4,
  ok: 5.4,
  fade: 9.8,
} as const;

function SecretsArt() {
  const T = SECRETS;
  const { ref, time } = useScene<HTMLDivElement>(T.loop, T.still);
  const fade = fadeOut(time, T.fade, T.loop);
  const typed = Math.round(progress(time, T.type) * PLAIN.length);
  const locked = time >= T.locked;
  const split = time >= T.split;
  const searched = SEARCH.slice(0, Math.round(progress(time, T.search) * SEARCH.length));

  return (
    <div ref={ref} className="flex h-full flex-col justify-center px-4 py-5 sm:px-5">
      <motion.div className="flex flex-col" animate={{ opacity: fade }} transition={{ duration: 0.1 }}>
        {/* The header as it's saved */}
        <div className="rounded-[14px] bg-white/[0.07] p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_28px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono text-white/55">Authorization</span>
            <AnimatePresence mode="popLayout" initial={false}>
              {locked ? (
                <Swap id="locked" className="bg-emerald-400/15 text-emerald-300">
                  <Lock className="size-3" /> Encrypted
                </Swap>
              ) : (
                <Swap id="plain" className="text-white/35">
                  Not saved yet
                </Swap>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-2 h-[18px] overflow-hidden font-mono text-[12.5px] leading-[18px] whitespace-nowrap">
            {PLAIN.split("").map((char, index) =>
              index >= typed ? null : <ScrambledChar key={index} index={index} plain={char} time={time} />,
            )}
            {time < T.scramble[0] && (
              <span className="ml-px inline-block h-[13px] w-px translate-y-[2px] animate-pulse bg-white/80 motion-reduce:animate-none" />
            )}
          </p>
        </div>

        {/* Where it goes from here: a stem from the field that splits toward
            each side, lit on the way to the server and dashed to the browser. */}
        <div className="relative h-9" aria-hidden>
          <span
            className={cn(
              "absolute top-0 left-1/2 h-1/2 w-0 border-l-[1.5px] transition-[border-color,filter] duration-500",
              split ? "border-[#a78bfa] drop-shadow-[0_0_4px_rgb(167_139_250/0.8)]" : "border-white/15",
            )}
          />
          <span className="absolute top-1/2 right-1/2 bottom-0 left-1/4 rounded-tl-[10px] border-t-[1.5px] border-l-[1.5px] border-dashed border-white/25" />
          <span
            className={cn(
              "absolute top-1/2 right-1/4 bottom-0 left-1/2 rounded-tr-[10px] border-t-[1.5px] border-r-[1.5px] transition-[border-color,filter] duration-500",
              split ? "border-[#a78bfa] drop-shadow-[0_0_4px_rgb(167_139_250/0.8)]" : "border-white/15",
            )}
          />
          <motion.span
            className="absolute top-1/2 left-[37.5%] grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#2a1715] text-red-300 shadow-[0_0_0_1px_rgb(248_113_113/0.4)]"
            initial={false}
            animate={{ opacity: split ? 1 : 0, scale: split ? 1 : 0.6 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            <X className="size-2.5" strokeWidth={3} />
          </motion.span>
        </div>

        <motion.div
          className="grid grid-cols-2 gap-2.5"
          initial={false}
          animate={{ opacity: split ? 1 : 0.35, y: split ? 0 : 4 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          {/* The visitor's browser: nothing to find */}
          {/* Narrow panels switch to shorter labels. */}
          <div className="@container min-w-0 rounded-[14px] bg-black/30 p-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
              <Monitor className="size-3.5 shrink-0 text-white/45" />
              <span className="truncate @max-[130px]:hidden">Visitor&apos;s browser</span>
              <span className="hidden truncate @max-[130px]:inline">Browser</span>
            </p>
            <div className="mt-2 flex h-[24px] items-center gap-1.5 rounded-[7px] bg-white/[0.06] px-2 font-mono text-[11px] text-white/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
              <Search className="size-3 shrink-0 text-white/40" />
              <span className="truncate">{searched}</span>
              {time >= T.search[0] && time < T.found && (
                <span className="-ml-1 inline-block h-[11px] w-px animate-pulse bg-white/70 motion-reduce:animate-none" />
              )}
            </div>
            <div className="mt-2 h-[30px]">
              {time >= T.found && (
                <motion.div
                  className="leading-tight"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                  <p className="flex items-center gap-1 text-[11.5px] font-medium text-red-300">
                    <X className="size-3 shrink-0" strokeWidth={2.5} /> No matches
                  </p>
                </motion.div>
              )}
            </div>
          </div>

          {/* Our server: decrypts it for this one call */}
          <div className="@container min-w-0 rounded-[14px] bg-[#6352f2]/[0.16] p-2.5 shadow-[inset_0_0_0_1px_rgb(167_139_250/0.35),0_0_32px_-8px_rgb(99_82_242/0.6)]">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/85">
              <LogoMark className="size-3.5 shrink-0" />
              <span className="truncate">Our server</span>
            </p>
            <div className="mt-2 flex h-[24px] items-center gap-1.5 overflow-hidden rounded-[7px] bg-white/[0.06] px-2 font-mono text-[11px] whitespace-nowrap shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
              <span className="text-[#c4b5fd] @max-[130px]:hidden">POST</span>
              <span className="truncate text-white/85">api.acme.com</span>
            </div>
            <div className="mt-2 h-[30px]">
              {time >= T.call && (
                <motion.div
                  className="leading-tight"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                  <p className="flex items-center gap-1 text-[11.5px] font-medium">
                    {time >= T.ok ? (
                      <span className="flex items-center gap-1 text-emerald-300">
                        <Check className="size-3 shrink-0" strokeWidth={2.5} /> 200 OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-white/60">
                        <Loader2 className="size-3 shrink-0 animate-spin motion-reduce:animate-none" /> Sending
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-white/40">
                    <KeyRound className="size-2.5 shrink-0" />
                    <span className="@max-[130px]:hidden">Decrypted for this call</span>
                    <span className="hidden @max-[130px]:inline">Decrypted here</span>
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// One character of the key: plain until the scramble reaches it, a few frames
// of noise, then the stored ciphertext.
function ScrambledChar({ index, plain, time }: { index: number; plain: string; time: number }) {
  const [from, to] = SECRETS.scramble;
  const at = from + (index / PLAIN.length) * (to - from);
  if (time < at - 0.22) return <span className={index < 7 ? "text-white/45" : "text-white"}>{plain}</span>;
  if (time < at) {
    const frame = Math.floor(time * 24);
    return <span className="text-[#c4b5fd]">{GLYPHS[(index * 31 + frame * 17 + index * frame) % GLYPHS.length]}</span>;
  }
  return <span className="text-[#c4b5fd]/80">{CIPHER[index]}</span>;
}

// ---------------------------------------------------------------------------
// It loads on the domains you list, and nowhere else.

const DOMAINS = [
  { host: "acme.com", allowed: true, at: 0.5 },
  { host: "app.acme.com", allowed: true, at: 1.4 },
  { host: "copycat.io", allowed: false, at: 2.5 },
];
const SITES = { loop: 8.6, still: 6, check: 0.6, fade: 8 } as const;

function DomainsArt() {
  const T = SITES;
  const { ref, time } = useScene<HTMLDivElement>(T.loop, T.still);
  const fade = fadeOut(time, T.fade, T.loop);

  return (
    <div ref={ref} className="flex h-full flex-col justify-center p-4 sm:p-5">
      <div className={cn(PANEL, "overflow-hidden")}>
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3.5 py-2.5">
          <Globe className="size-[15px] text-zinc-400" />
          <span className="text-[12.5px] font-semibold">Allowed domains</span>
          <span className="ml-auto text-[11px] text-zinc-400">2 domains</span>
        </div>
        <motion.div animate={{ opacity: fade }} transition={{ duration: 0.1 }}>
          {DOMAINS.map((domain) => {
            const shown = time >= domain.at;
            const checked = time >= domain.at + T.check;
            const blocked = checked && !domain.allowed;
            return (
              <motion.div
                key={domain.host}
                className={cn(
                  "flex items-center gap-3 border-b border-zinc-100 px-3.5 py-3 transition-colors duration-300 last:border-b-0",
                  blocked && "bg-red-50/70",
                )}
                initial={false}
                animate={{
                  opacity: shown ? 1 : 0.35,
                  x: blocked ? [0, -5, 5, -3, 3, 0] : 0,
                }}
                transition={{
                  opacity: { duration: 0.3 },
                  x: { duration: 0.45, ease: "easeOut" },
                }}
              >
                {/* Its launcher, as it would sit on that site */}
                <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-zinc-100">
                  <span
                    className={cn(
                      "orb-fill size-5 rounded-full transition-[filter,opacity] duration-300",
                      !checked && "opacity-30 grayscale",
                      blocked && "opacity-25 grayscale",
                    )}
                  />
                  {blocked && (
                    <Ban
                      className="absolute size-[22px] text-red-500"
                      strokeWidth={2.2}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                  {domain.host}
                </span>
                {!shown ? null : !checked ? (
                  <Swap id="checking" className="text-zinc-400">
                    <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />{" "}
                    Checking
                  </Swap>
                ) : domain.allowed ? (
                  <Swap id="loads" className="bg-emerald-50 text-emerald-700">
                    <Check className="size-3" /> Loads
                  </Swap>
                ) : (
                  <Swap id="blocked" className="bg-red-100 text-red-700">
                    <Ban className="size-3" /> Blocked
                  </Swap>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// It can't fix this one, so the team gets the whole story. The follow-up
// travels to the team's inbox and lands as one finished email, then the
// webhook fires. Every box keeps its size, so nothing shifts as it plays.
const HANDOFF = {
  loop: 12.4,
  still: 9,
  ask: [0.35, 1.5],
  tool: 1.9,
  send: [2.05, 2.95],
  email: 2.95,
  hook: 3.55,
  reply: [3.1, 5],
  fade: 11.3,
} as const;

const SUMMARY =
  "Maya was charged $49 twice on October 1 and wants one charge refunded. Card ending 4242.";

function HandoffArt() {
  const T = HANDOFF;
  const { ref, time } = useScene<HTMLDivElement>(T.loop, T.still);
  // The whole scene fades in at the start and out at the end, together.
  const fade = Math.min(clamp01(time / 0.35), fadeOut(time, T.fade, T.loop));
  const ask = wordsAt(
    "I was charged twice in October.",
    T.ask[0],
    T.ask[1],
    time,
  );
  const reply = wordsAt(
    "I can't issue refunds, but I've passed this to the billing team with all the details.",
    T.reply[0],
    T.reply[1],
    time,
  );
  const travel = progress(time, T.send);
  const sending = time >= T.send[0] && time < T.email;
  const arrived = time >= T.email;
  const hooked = time >= T.hook;
  // A smooth start and finish for the envelope's trip.
  const eased = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2;

  return (
    <motion.div
      ref={ref}
      className="flex h-full flex-col items-center justify-center p-3 sm:p-6 md:flex-row lg:px-8"
      animate={{ opacity: fade }}
      transition={{ duration: 0.1 }}
    >
      <div className={cn(PANEL, "w-full max-w-[290px] shrink-0 p-3.5")}>
        <div className="flex items-center gap-2">
          <span className="orb-fill size-6 rounded-full" />
          <span className="text-[12.5px] font-semibold">{BRAND.name}</span>
          <span className="ml-auto text-[11px] text-zinc-400">On a call</span>
        </div>
        <Thread fade={1} className="mt-3 h-[176px] border-t border-zinc-100 pt-3">
          {ask && (
            <Bubble key="ask" role="user" pending={time < T.ask[1] + 0.3}>
              {ask}
            </Bubble>
          )}
          {time >= T.tool && (
            <Activity key="tool" icon={<Sparkles className="size-3 text-accent" />}>
              Looped in the team
            </Activity>
          )}
          {reply && (
            <Bubble key="reply" role="assistant">
              {reply}
            </Bubble>
          )}
        </Thread>
      </div>

      {/* The follow-up on its way: down to the inbox on phones, across on wider screens. */}
      <div
        className="relative h-10 w-px shrink-0 bg-zinc-900/12 md:h-px md:w-16 xl:w-20"
        style={{ ["--p" as string]: eased }}
        aria-hidden
      >
        <span className="absolute top-0 left-0 h-[calc(var(--p)*100%)] w-full bg-accent md:h-full md:w-[calc(var(--p)*100%)]" />
        <span
          className={cn(
            "absolute top-[calc(var(--p)*100%)] left-1/2 grid size-[26px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-white shadow-[0_0_0_3px_rgb(255_255_255/0.9),0_6px_16px_-4px_rgb(99_82_242/0.8)] transition-[opacity,scale] duration-200 md:top-1/2 md:left-[calc(var(--p)*100%)]",
            sending ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        >
          <Mail className="size-3.5" />
        </span>
      </div>

      <div className="flex w-full max-w-[400px] min-w-0 flex-col gap-2 md:flex-1">
        {/* The team's inbox. The email is always laid out, so the box never
            changes size; before it arrives, the empty inbox covers it. */}
        <div className="relative">
          <motion.div
            className={cn(PANEL, "p-4")}
            initial={false}
            animate={{ opacity: arrived ? 1 : 0, x: arrived ? 0 : -14, scale: arrived ? 1 : 0.98 }}
            transition={{ type: "spring", duration: 0.55, bounce: 0.1 }}
          >
            <div className="flex items-center gap-2 text-[11.5px] text-zinc-500">
              <Mail className="size-3.5" />
              <span>
                To <span className="font-medium text-zinc-700">support@acme.com</span>
              </span>
              <span className="ml-auto">now</span>
            </div>
            <p className="mt-2.5 text-[13.5px] leading-snug font-semibold">Follow-up: Charged twice for October</p>
            <p className="mt-2 text-[12px] text-zinc-500">{BRAND.name} needs your team to follow up with a visitor.</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-700">{SUMMARY}</p>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-500">
              <span>Reply to maya@northwind.co</span>
              <span className="font-mono text-[10.5px]">/billing</span>
              <span className="font-medium text-accent-ink">Transcript</span>
            </div>
          </motion.div>
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-zinc-900/15 text-[12px] text-zinc-500"
            initial={false}
            animate={{ opacity: arrived ? 0 : 1, scale: arrived ? 0.98 : 1 }}
            transition={{ duration: 0.25 }}
          >
            <Mail className="size-[18px] text-zinc-400" />
            support@acme.com
          </motion.div>
          {/* A ring as it lands */}
          <AnimatePresence>
            {arrived && time < T.email + 1.2 && (
              <motion.span
                key="landed"
                className="pointer-events-none absolute inset-0 rounded-[16px] border-2 border-accent"
                initial={{ opacity: 0.9, scale: 1 }}
                animate={{ opacity: 0, scale: 1.04 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
        </div>
        <motion.div
          className="flex items-center gap-2 self-start rounded-full bg-[#161411] py-1.5 pr-3 pl-2 font-mono text-[11px] text-white/80 shadow-[0_8px_20px_-10px_rgb(0_0_0/0.5)]"
          initial={false}
          animate={{ opacity: hooked ? 1 : 0, y: hooked ? 0 : 6 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <Webhook className="size-3.5 text-[#c4b5fd]" />
          POST /hooks/follow-up
          <span className="text-emerald-300">200</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
