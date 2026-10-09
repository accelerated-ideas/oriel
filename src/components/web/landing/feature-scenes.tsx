"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Keyboard,
  Loader2,
  Lock,
  Mic,
  PhoneOff,
  Plus,
  RotateCw,
  Search,
  Share,
  Sparkles,
  Star,
} from "lucide-react";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/dashboard/logo";
import { StripeMark } from "@/components/brand/stripe-logo";
import { cn } from "@/lib/utils";
import { Backdrop, type PaletteName } from "./backdrop";
import { between, EASE_OUT, wordsAt } from "./motion";

// One visitor, Maya, on a made-up SaaS app (Acme) with the assistant open
// beside it. Each scene is a short script played on a clock: what she says,
// what the assistant says and does, and what changes on the page. The same
// window and panel stay on stage from scene to scene, so it reads as one
// product doing four things.

export type SceneLayout = "wide" | "narrow";

type Span = readonly [number, number];

// ---------------------------------------------------------------------------
// The stage

// Scenes are drawn at a fixed size, like a screenshot, and scaled to fit, so
// the composition holds at any width. Small stages get a stacked layout.
const CANVAS = { wide: { width: 720, height: 500 }, narrow: { width: 380, height: 560 } } as const;
const NARROW_BELOW = 540;
const MAX_SCALE = 1.15;

// Where things sit on each canvas. The app is a full-size 16:9 browser window
// that runs off the right and bottom edges, like a real dashboard cropped by
// the frame. The panel floats over its right side, taller than the window
// shows, so a whole exchange fits; notes hang over the page's lower left.
const BOX = {
  wide: {
    app: { left: 24, top: 56, width: 1000, height: 563 },
    panel: { left: 456, top: 30, width: 232, height: 440 },
    note: { left: 40, top: 338, width: 256 },
    card: { left: 44, top: 94, width: 360 },
    glow: { left: 352, top: 30, size: 440 },
    control: "top-3 left-3",
  },
  // Stacked: the window on top, the panel below it.
  narrow: {
    app: { left: 12, top: 40, width: 560, height: 315 },
    panel: { left: 22, top: 268, width: 336, height: 284 },
    note: { left: 40, top: 188, width: 300 },
    card: { left: 14, top: 50, width: 352 },
    glow: { left: 10, top: 224, size: 360 },
    control: "top-2.5 right-2.5",
  },
} as const;


export function Stage({
  children,
  palette,
  control,
  fitScreen = false,
}: {
  children: (layout: SceneLayout) => React.ReactNode;
  palette: PaletteName;
  /** Sits in a corner the scene leaves clear, unscaled. */
  control?: React.ReactNode;
  /** Never taller than the screen, less room for the nav. */
  fitScreen?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ layout: SceneLayout; scale: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const width = box.clientWidth;
      // Hidden at this breakpoint: draw nothing, so no shader runs for it.
      if (!width) return setFit(null);
      const layout: SceneLayout = width < NARROW_BELOW ? "narrow" : "wide";
      const { width: canvasWidth, height: canvasHeight } = CANVAS[layout];
      const tallest = fitScreen ? (window.innerHeight - 112) / canvasHeight : Infinity;
      const scale = Math.min(MAX_SCALE, width / canvasWidth, tallest);
      setFit((current) => (current?.layout === layout && current.scale === scale ? current : { layout, scale }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (fitScreen) window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fitScreen]);

  const canvas = CANVAS[fit?.layout ?? "wide"];

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-[22px] bg-[#e4dfd4] sm:rounded-[30px]"
      style={fit ? { height: canvas.height * fit.scale } : { aspectRatio: `${canvas.width} / ${canvas.height}` }}
    >
      {fit && <Backdrop palette={palette} />}
      {/* The chapter's text says what happens here, and this changes many times a second. */}
      {fit && (
        <div
          aria-hidden
          className="absolute top-0 left-1/2"
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `translateX(-50%) scale(${fit.scale})`,
            transformOrigin: "50% 0",
          }}
        >
          {children(fit.layout)}
        </div>
      )}
      {control && <div className={cn("absolute z-40", BOX[fit?.layout ?? "wide"].control)}>{control}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scripts

type Line = { id: string; role: "user" | "assistant"; text: React.ReactNode; pending?: boolean };
type Activity = { id: string; role: "activity"; text: string; running?: boolean };
type Message = Line | Activity;

type Status = "Listening" | "Thinking…" | "Speaking";

type Frame = {
  nav: NavKey;
  path: string;
  /** Progress of a page load, while one is happening. */
  loading: number | null;
  page: { key: string; render: (layout: SceneLayout) => React.ReactNode };
  call: {
    mode: "call" | "chat";
    status: Status;
    /** How loud the assistant is, 0 to 1. */
    level: number;
    messages: Message[];
    /** What the visitor is typing, in chat. */
    draft?: string;
    /** The switch-to-typing button, mid-press. */
    pressed?: boolean;
  };
  /** A look behind the scenes: what the assistant knows or just ran. */
  note?: { key: string; node: React.ReactNode } | null;
  /** What the team sees afterwards, over the app. */
  card?: React.ReactNode;
  /** Everything scripted fades out before the loop starts over. */
  fade: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const progress = (time: number, [from, to]: Span) => clamp01((time - from) / (to - from));
const fadeOut = (time: number, from: number, loop: number) => (time < from ? 1 : clamp01(1 - (time - from) / (loop - from)));
const inAny = (time: number, spans: Span[]) => spans.some(([from, to]) => between(time, from, to));

// A voice's loudness while it talks: uneven, like speech.
function loudness(time: number) {
  return 0.35 + 0.65 * Math.abs(Math.sin(time * 6.1) * Math.sin(time * 2.3 + 1));
}

function statusAt(time: number, speaking: Span[], thinking: Span[]): Status {
  if (inAny(time, speaking)) return "Speaking";
  if (inAny(time, thinking)) return "Thinking…";
  return "Listening";
}

// The visitor's words as the transcript hears them, faded until the turn ends.
function heard(id: string, text: string, [start, end]: Span, time: number): Line | null {
  if (time < start) return null;
  return { id, role: "user", text: wordsAt(text, start, end, time), pending: time < end + 0.25 };
}

// The assistant's words as its voice reaches them. If it's cut off, the line
// ends where it stopped.
function said(id: string, text: string, [start, end]: Span, time: number, cut?: number): Line | null {
  if (time < start) return null;
  if (cut === undefined || time < cut) return { id, role: "assistant", text: wordsAt(text, start, end, time) };
  return { id, role: "assistant", text: `${wordsAt(text, start, end, cut).replace(/[,.]$/, "")}—` };
}

const present = <T,>(items: (T | null | false)[]) => items.filter(Boolean) as T[];

// It talks, gets interrupted, answers the new question, and the visitor
// switches to typing.
export const CALL = {
  loop: 13.6,
  still: 9,
  ask: [0.4, 1.7],
  first: [2.4, 5.6],
  cut: 4.5,
  cutIn: [4.2, 5.6],
  answer: [6.2, 8.7],
  press: 9.25,
  chat: 9.6,
  typing: [9.9, 11],
  send: 11.2,
  reply: [11.7, 12.4],
  fade: 13,
  beats: [
    [2.4, 4.2],
    [4.2, 9.25],
    [9.25, 13],
  ],
} as const;

const TYPED = "Not yet, I'll ask my team first.";

function callFrame(time: number): Frame {
  const T = CALL;
  const speaking = inAny(time, [[T.first[0], T.cut], T.answer]);
  // It drops its voice the moment she starts talking over it.
  const ducked = between(time, T.cutIn[0], T.cut);
  const typing = between(time, T.typing[0], T.send);

  return {
    nav: "dashboard",
    path: "/dashboard",
    loading: null,
    page: { key: "dashboard", render: (layout) => <DashboardPage layout={layout} /> },
    call: {
      mode: time >= T.chat ? "chat" : "call",
      status: statusAt(time, [[T.first[0], T.cut], T.answer], [[1.9, T.first[0]], [5.8, T.answer[0]]]),
      level: speaking ? loudness(time) * (ducked ? 0.3 : 1) : 0,
      messages: present<Message>([
        heard("ask", "When does my plan renew?", T.ask, time),
        said("first", "On the first of each month. If you switch to annual, you'd save two months, and", T.first, time, T.cut),
        heard("cut-in", "Wait, how much is annual?", T.cutIn, time),
        said("answer", "It's $490 a year instead of $588. Want me to switch you?", T.answer, time),
        time >= T.send && { id: "typed", role: "user", text: TYPED },
        said("reply", "Sure. I'm here when you're ready.", T.reply, time),
      ]),
      draft: typing ? TYPED.slice(0, Math.round(progress(time, T.typing) * TYPED.length)) : "",
      pressed: between(time, T.press, T.chat + 0.1),
    },
    fade: fadeOut(time, T.fade, T.loop),
  };
}

// It reads the page and the site map, takes her to Billing and points.
export const CONTEXT = {
  loop: 11.2,
  still: 8.8,
  ask: [0.4, 1.9],
  note: [0.7, 3.9],
  found: 2.3,
  say: [2.7, 4.3],
  load: [3.5, 4.1],
  go: 4,
  latest: [5, 6.5],
  point: 5.6,
  fade: 10.5,
  beats: [
    [0.4, 2.7],
    [2.7, 5],
    [5, 10.5],
  ],
} as const;

function contextFrame(time: number): Frame {
  const T = CONTEXT;
  const billing = time >= T.go;

  return {
    nav: billing ? "billing" : "dashboard",
    path: billing ? "/billing" : "/dashboard",
    loading: between(time, T.load[0], T.load[1] + 0.2) ? progress(time, T.load) : null,
    page: billing
      ? { key: "billing", render: (layout) => <BillingPage layout={layout} ring={time >= T.point && time < T.fade} /> }
      : { key: "dashboard", render: (layout) => <DashboardPage layout={layout} /> },
    call: {
      mode: "call",
      status: statusAt(time, [T.say, T.latest], [[2, T.say[0]]]),
      level: inAny(time, [T.say, T.latest]) ? loudness(time) : 0,
      messages: present<Message>([
        heard("ask", "Where can I find my invoices?", T.ask, time),
        said("say", "They're under Billing. Taking you there now.", T.say, time),
        said("latest", "Here's your latest one, from October.", T.latest, time),
      ]),
    },
    note: between(time, T.note[0], T.note[1]) ? { key: "context", node: <ContextNote found={time >= T.found} /> } : null,
    fade: fadeOut(time, T.fade, T.loop),
  };
}

// It says what it's about to do, waits for a yes, changes the plan in Stripe,
// and the page shows it.
export const ACTION = {
  loop: 12.6,
  still: 10.4,
  ask: [0.4, 1.8],
  confirm: [2.4, 5],
  yes: [5.4, 6.2],
  run: 6.6,
  ran: 7.9,
  done: [8.4, 9.5],
  fade: 11.9,
  beats: [
    [2.4, 6.6],
    [6.6, 8.4],
    [8.4, 11.9],
  ],
} as const;

function actionFrame(time: number): Frame {
  const T = ACTION;
  const annual = time >= T.ran && time < T.fade + 0.4;

  return {
    nav: "billing",
    path: "/billing",
    loading: null,
    page: {
      key: "billing",
      render: (layout) => <BillingPage layout={layout} annual={annual} changed={between(time, T.ran, T.ran + 1.8)} />,
    },
    call: {
      mode: "call",
      status: statusAt(time, [T.confirm, T.done], [[2, T.confirm[0]], [6.4, T.done[0]]]),
      level: inAny(time, [T.confirm, T.done]) ? loudness(time) : 0,
      messages: present<Message>([
        heard("ask", "Can you switch me to annual?", T.ask, time),
        said("confirm", "That's Pro annual, $490 a year, starting today. Should I go ahead?", T.confirm, time),
        heard("yes", "Yes, go ahead.", T.yes, time),
        time >= T.run && { id: "run", role: "activity", text: "Change plan", running: time < T.ran },
        said("done", "Done. You're on annual now.", T.done, time),
      ]),
    },
    note:
      time >= T.run && time < T.fade
        ? { key: "stripe", node: <ActionNote done={time >= T.ran} verified={time >= T.done[0]} /> }
        : null,
    fade: fadeOut(time, T.fade, T.loop),
  };
}

// She's stuck. It asks what happened, helps, and writes it up for the team.
export const INSIGHTS = {
  loop: 14.4,
  still: 12.6,
  vent: [0.4, 2.4],
  ask: [3, 5.2],
  answer: [5.6, 6.7],
  noted: 7,
  help: [7.5, 9.6],
  card: 7.4,
  title: [7.9, 8.5],
  details: [8.6, 10.6],
  meta: 10.8,
  marks: { file: 8.3, tries: 8.9 },
  fade: 13.7,
  beats: [
    [3, 7],
    [7, 10.8],
    [10.8, 13.7],
  ],
} as const;

function insightsFrame(time: number): Frame {
  const T = INSIGHTS;
  const vent = heard("vent", "The import keeps spinning. That's the third time today.", T.vent, time);
  const answer = heard("answer", "A CSV, about 8 MB.", T.answer, time);
  // Once they're said, the words the write-up uses get marked.
  if (vent && !vent.pending) {
    vent.text = <Marked text={vent.text as string} marks={[{ phrase: "third time", on: time >= T.marks.tries }]} />;
  }
  if (answer && !answer.pending) {
    const on = time >= T.marks.file;
    answer.text = <Marked text={answer.text as string} marks={[{ phrase: "CSV", on }, { phrase: "8 MB", on }]} />;
  }

  return {
    nav: "contacts",
    path: "/contacts/import",
    loading: null,
    page: { key: "import", render: (layout) => <ImportPage layout={layout} /> },
    call: {
      mode: "call",
      status: statusAt(time, [T.ask, T.help], [[2.6, T.ask[0]], [6.9, T.help[0]]]),
      level: inAny(time, [T.ask, T.help]) ? loudness(time) : 0,
      messages: present<Message>([
        vent,
        said("ask", "Sorry about that. What file is it, and how big?", T.ask, time),
        answer,
        time >= T.noted && { id: "noted", role: "activity", text: "Noted feedback" },
        said("help", "Big files can time out. Splitting it in two will work for now.", T.help, time),
      ]),
    },
    card: time >= T.card && time < T.fade ? <InsightCard time={time} /> : null,
    fade: fadeOut(time, T.fade, T.loop),
  };
}

// Each scene's light: the voice, finding the way, getting it done, and the team hearing about trouble.
export const SCENES: { loop: number; still: number; beats: readonly Span[]; palette: PaletteName; frame: (time: number) => Frame }[] = [
  { loop: CALL.loop, still: CALL.still, beats: CALL.beats, palette: "iris", frame: callFrame },
  { loop: CONTEXT.loop, still: CONTEXT.still, beats: CONTEXT.beats, palette: "sky", frame: contextFrame },
  { loop: ACTION.loop, still: ACTION.still, beats: ACTION.beats, palette: "mint", frame: actionFrame },
  { loop: INSIGHTS.loop, still: INSIGHTS.still, beats: INSIGHTS.beats, palette: "coral", frame: insightsFrame },
];

// ---------------------------------------------------------------------------
// The scene

export function FeatureScene({ index, time, layout }: { index: number; time: number; layout: SceneLayout }) {
  const frame = SCENES[index].frame(time);
  const box = BOX[layout];

  return (
    <div className="absolute inset-0">
      {/* The assistant's voice, as light behind the panel. */}
      <div
        className="pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,rgb(99_82_242/0.32),rgb(99_82_242/0))] transition-[opacity,transform] duration-150 ease-out"
        style={{
          left: box.glow.left,
          top: box.glow.top,
          width: box.glow.size,
          height: box.glow.size,
          opacity: 0.3 + frame.call.level * 0.7,
          transform: `scale(${0.92 + frame.call.level * 0.12})`,
        }}
        aria-hidden
      />

      <AppWindow layout={layout} nav={frame.nav} path={frame.path} loading={frame.loading} dim={Boolean(frame.card)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={frame.page.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            {frame.page.render(layout)}
          </motion.div>
        </AnimatePresence>
      </AppWindow>

      <AnimatePresence>
        {frame.note && (
          <motion.div
            key={`${index}-${frame.note.key}`}
            className="absolute z-30"
            style={{ left: box.note.left, top: box.note.top, width: box.note.width }}
            initial={{ opacity: 0, y: 12, scale: 0.97, filter: "blur(4px)" }}
            animate={{ opacity: frame.fade, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 6, scale: 0.98, filter: "blur(3px)" }}
            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
          >
            {frame.note.node}
          </motion.div>
        )}
      </AnimatePresence>

      <CallPanel layout={layout} call={frame.call} chapter={index} fade={frame.fade} />

      <AnimatePresence>
        {frame.card && (
          <motion.div
            key={`${index}-card`}
            className="absolute z-30"
            style={{ left: box.card.left, top: box.card.top, width: box.card.width }}
            // It comes out of the panel, where "Noted feedback" appeared.
            initial={layout === "wide" ? { opacity: 0, x: 340, y: 170, scale: 0.3 } : { opacity: 0, x: 0, y: 280, scale: 0.4 }}
            animate={{ opacity: frame.fade, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", duration: 0.7, bounce: 0.12 }}
          >
            {frame.card}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The customer's app

const APP_NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "contacts", label: "Contacts" },
  { key: "billing", label: "Billing" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
] as const;
type NavKey = (typeof APP_NAV)[number]["key"];

const CARD = "rounded-[10px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_1px_2px_rgb(0_0_0/0.04)]";

// A full-size browser window, larger than the stage, so the page runs on
// behind the panel and off the edges like a real dashboard would.
function AppWindow({
  layout,
  nav,
  path,
  loading,
  dim,
  children,
}: {
  layout: SceneLayout;
  nav: NavKey;
  path: string;
  loading: number | null;
  dim: boolean;
  children: React.ReactNode;
}) {
  const wide = layout === "wide";
  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-[14px] bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_4px_-1px_rgb(0_0_0/0.05),0_32px_70px_-24px_rgb(30_20_60/0.4)]"
      style={BOX[layout].app}
    >
      <BrowserBar layout={layout} path={path} loading={loading} />
      {wide ? (
        <>
          <TopBar />
          <Tabs nav={nav} className="h-[34px] px-6" />
        </>
      ) : (
        <div className="flex h-[34px] shrink-0 items-end gap-4 border-b border-zinc-200/70 px-3.5">
          <Logo className="mb-[9px]" />
          <Tabs nav={nav} className="h-full border-b-0" />
        </div>
      )}
      <div className="relative min-h-0 flex-1 bg-[#fafafa]">{children}</div>
      <AnimatePresence>
        {dim && (
          <motion.div
            key="dim"
            className="absolute inset-0 bg-[#2a2620]/[0.14]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// The window's own bar: window buttons, back and forward, and a full-width
// address field with the browser's buttons after it. The address reads from
// the left, so it stays in view while the rest runs on behind the panel.
function BrowserBar({ layout, path, loading }: { layout: SceneLayout; path: string; loading: number | null }) {
  const wide = layout === "wide";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center border-b border-zinc-200/80 bg-[#f5f5f6]",
        wide ? "h-[40px] gap-4 px-4" : "h-[34px] gap-3 px-3",
      )}
    >
      <div className="flex gap-[7px]">
        {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
          <span
            key={color}
            className={cn("rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15)]", wide ? "size-[11px]" : "size-[10px]")}
            style={{ background: color }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <ChevronLeft className="size-[15px] text-zinc-500" />
        <ChevronRight className="size-[15px] text-zinc-300" />
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-[8px] bg-white px-2.5 shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_1px_2px_rgb(0_0_0/0.04)]",
          wide ? "h-[26px] text-[11.5px]" : "h-[24px] text-[11px]",
        )}
      >
        <Lock className="size-[10px] shrink-0 text-zinc-400" strokeWidth={2.5} />
        <span className="flex min-w-0 flex-1 items-baseline truncate">
          <span className="text-zinc-800">app.acme.io</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={path}
              className="text-zinc-400"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16 }}
            >
              {path}
            </motion.span>
          </AnimatePresence>
        </span>
        <Star className="size-[11px] shrink-0 text-zinc-400" />
      </div>
      <div className="flex items-center gap-3.5 text-zinc-500">
        <RotateCw className="size-[13px]" />
        <Share className="size-[13px]" />
        <Plus className="size-[14px]" />
        <Copy className="size-[13px]" />
      </div>
      {/* The page loading, when the assistant moves it */}
      <span
        className={cn(
          "absolute -bottom-px left-0 h-[2px] bg-accent transition-opacity duration-200",
          loading === null ? "opacity-0" : "opacity-100",
        )}
        style={{ width: `${(loading ?? 1) * 100}%` }}
      />
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center gap-2", className)}>
      <span className="grid size-[18px] place-items-center rounded-[5px] bg-zinc-900 text-[10px] font-bold text-white">A</span>
      <span className="text-[12.5px] font-semibold tracking-[-0.01em]">Acme</span>
    </span>
  );
}

function TopBar() {
  return (
    <div className="flex h-[40px] shrink-0 items-center gap-2.5 border-b border-zinc-200/70 px-6">
      <Logo />
      <span className="text-[13px] text-zinc-300">/</span>
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-700">
        <span className="size-[14px] rounded-[4px] bg-[linear-gradient(135deg,#38bdf8,#6366f1)]" />
        Northwind
        <ChevronsUpDown className="size-3 text-zinc-400" />
      </span>
      <span className="ml-5 flex h-[26px] w-[190px] items-center gap-2 rounded-[7px] bg-zinc-100 px-2.5 text-[11px] text-zinc-400">
        <Search className="size-3" />
        Search
        <span className="ml-auto text-[10px]">⌘K</span>
      </span>
      <span className="ml-auto flex items-center gap-4 text-zinc-400">
        <span className="text-[11px] text-zinc-500">Docs</span>
        <Bell className="size-[14px]" />
        <span className="grid size-[24px] place-items-center rounded-full bg-amber-100 text-[9px] font-semibold text-amber-800">MC</span>
      </span>
    </div>
  );
}

function Tabs({ nav, className }: { nav: NavKey; className?: string }) {
  // The page can mount a scene twice (phone and desktop), so the shared layout needs its own id.
  const id = useId();
  return (
    <div className={cn("flex shrink-0 items-end gap-5 border-b border-zinc-200/70", className)}>
      {APP_NAV.map((item) => {
        const active = item.key === nav;
        return (
          <span
            key={item.key}
            className={cn(
              "relative pb-[9px] text-[11.5px] whitespace-nowrap transition-colors duration-200",
              active ? "font-medium text-zinc-900" : "text-zinc-500",
            )}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId={`${id}-tab`}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-zinc-900"
                transition={{ type: "spring", duration: 0.5, bounce: 0 }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

function Page({ layout, title, sub, children }: { layout: SceneLayout; title: string; sub?: string; children: React.ReactNode }) {
  const wide = layout === "wide";
  return (
    <div className={wide ? "px-6 pt-[18px]" : "px-3.5 pt-3"}>
      <p className={cn("leading-tight font-semibold tracking-[-0.02em]", wide ? "text-[16px]" : "text-[15px]")}>{title}</p>
      {sub && wide && <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>}
      {children}
    </div>
  );
}

// What the story needs sits in the left column, clear of the panel; the right
// column carries on underneath it.
function Columns({ layout, children }: { layout: SceneLayout; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid items-start",
        layout === "wide" ? "mt-4 grid-cols-[400px_minmax(0,1fr)] gap-4" : "mt-2.5 grid-cols-[330px_minmax(0,1fr)] gap-3",
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
      <span className="text-[11px] font-semibold">{title}</span>
      {action && <span className="text-[10.5px] text-zinc-500">{action}</span>}
    </div>
  );
}

const STATS = [
  { label: "Revenue", value: "$48,210", delta: "+6.2%" },
  { label: "Customers", value: "1,284", delta: "+38" },
  { label: "Churn", value: "1.9%", delta: "−0.3%" },
  { label: "Average order", value: "$86", delta: "+4.1%" },
];

const CHART = [64, 58, 61, 50, 54, 44, 47, 38, 41, 30, 34, 24, 27, 16];
const CHART_LINE = CHART.map((y, index) => `${index ? "L" : "M"}${((index / (CHART.length - 1)) * 300).toFixed(1)} ${y}`).join(" ");

const PLAN_MIX = [
  { plan: "Pro", share: 64 },
  { plan: "Starter", share: 28 },
  { plan: "Team", share: 8 },
];

const SIGNUPS = [
  { company: "Lumen Labs", plan: "Pro", mrr: "$49", when: "2h ago" },
  { company: "Harbor & Co", plan: "Starter", mrr: "$19", when: "5h ago" },
  { company: "Fieldnote", plan: "Pro", mrr: "$49", when: "Yesterday" },
];

function DashboardPage({ layout }: { layout: SceneLayout }) {
  return (
    <Page layout={layout} title="Good morning, Maya" sub="Here's how Northwind is doing this week.">
      <div className={cn("grid grid-cols-4", layout === "wide" ? "mt-4 gap-3" : "mt-2.5 gap-2")}>
        {STATS.map((stat) => (
          <div key={stat.label} className={cn(CARD, "p-2.5")}>
            <p className="truncate text-[10.5px] text-zinc-500">{stat.label}</p>
            <p className="mt-0.5 text-[16px] font-semibold tracking-[-0.02em] tabular">{stat.value}</p>
            <p className="text-[10px] font-medium text-emerald-600">{stat.delta}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <div className={cn(CARD, "p-3")}>
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold">Revenue</p>
            <p className="text-[10px] text-zinc-500">Last 30 days</p>
          </div>
          <div className="relative mt-2.5 h-[78px]">
            {[0, 1, 2].map((line) => (
              <span key={line} className="absolute inset-x-0 border-t border-dashed border-zinc-200" style={{ top: `${line * 50}%` }} />
            ))}
            <svg viewBox="0 0 300 72" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
              <path d={`${CHART_LINE} L300 72 L0 72 Z`} fill="rgb(99 82 242 / 0.08)" />
              <path d={CHART_LINE} fill="none" stroke="#6352f2" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="mt-1.5 flex justify-between text-[9.5px] text-zinc-400">
            <span>Sep 8</span>
            <span>Sep 22</span>
            <span>Oct 6</span>
          </div>
        </div>
        <div className={cn(CARD, "p-3")}>
          <p className="text-[11px] font-semibold">Customers by plan</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {PLAN_MIX.map((item) => (
              <div key={item.plan} className="text-[10.5px]">
                <div className="flex justify-between">
                  <span>{item.plan}</span>
                  <span className="text-zinc-500 tabular">{item.share}%</span>
                </div>
                <div className="mt-1 h-[4px] rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-zinc-800" style={{ width: `${item.share}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={cn(CARD, "mt-3")}>
        <CardHeader title="New customers" action="View all" />
        {SIGNUPS.map((signup) => (
          <div key={signup.company} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center border-b border-zinc-100 px-3 py-[7px] text-[11px] last:border-b-0">
            <span className="font-medium">{signup.company}</span>
            <span className="text-zinc-500">{signup.plan}</span>
            <span className="text-zinc-500 tabular">{signup.mrr}</span>
            <span className="text-zinc-400">{signup.when}</span>
          </div>
        ))}
      </div>
    </Page>
  );
}

const INVOICES = [
  { month: "October", number: "INV-1042" },
  { month: "September", number: "INV-0987" },
  { month: "August", number: "INV-0931" },
  { month: "July", number: "INV-0876" },
  { month: "June", number: "INV-0822" },
];

function BillingPage({
  layout,
  annual = false,
  changed = false,
  ring = false,
}: {
  layout: SceneLayout;
  annual?: boolean;
  /** The plan just changed. */
  changed?: boolean;
  /** The assistant is pointing at the latest invoice. */
  ring?: boolean;
}) {
  // On narrow stages the window shows less, so the plan fits on one line and
  // the latest invoice stays in view.
  const wide = layout === "wide";
  return (
    <Page layout={layout} title="Billing" sub="Your plan, payment method and invoices.">
      <Columns layout={layout}>
        <div className="flex flex-col gap-3">
          <div className={cn(CARD, "relative", wide ? "p-3" : "px-3 py-2")}>
            <AnimatePresence>
              {changed && (
                <motion.span
                  key="changed"
                  className="absolute -inset-px rounded-[10px] border-[1.5px] border-accent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, boxShadow: ["0 0 0 0 rgb(99 82 242 / 0.35)", "0 0 0 10px rgb(99 82 242 / 0)"] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, boxShadow: { duration: 1, ease: "easeOut" } }}
                />
              )}
            </AnimatePresence>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold">Pro plan</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[9.5px] font-medium transition-colors duration-300",
                  annual ? "bg-accent-soft text-accent-ink" : "bg-zinc-100 text-zinc-600",
                )}
              >
                {annual ? "Annual" : "Monthly"}
              </span>
              {wide ? (
                <span className="ml-auto rounded-[6px] bg-white px-2 py-[3px] text-[10px] font-medium shadow-[0_0_0_1px_rgb(0_0_0/0.1)]">
                  Change plan
                </span>
              ) : (
                <span className="ml-auto">
                  <Price annual={annual} className="text-[14px]" />
                </span>
              )}
            </div>
            {wide && (
              <div className="mt-2 flex items-end justify-between">
                <Price annual={annual} className="text-[20px]" />
                <span className="text-[10px] text-zinc-500">3 of 5 seats used</span>
              </div>
            )}
          </div>

          <div className={CARD}>
            <CardHeader title="Invoices" action={wide ? "View all" : undefined} />
            {INVOICES.map((invoice, index) => (
              <div key={invoice.number} className="relative flex items-center gap-2 border-b border-zinc-100 px-3 py-[7px] text-[11px] last:border-b-0">
                {index === 0 && (
                  <AnimatePresence>
                    {ring && (
                      <motion.span
                        key="ring"
                        className="absolute -inset-[3px] z-10 rounded-[9px] border-2 border-accent"
                        initial={{ opacity: 0, scale: 1.12 }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          boxShadow: ["0 0 0 3px rgb(99 82 242 / 0.25)", "0 0 0 9px rgb(99 82 242 / 0)", "0 0 0 3px rgb(99 82 242 / 0.25)"],
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE_OUT, boxShadow: { duration: 1.3, repeat: Infinity, ease: "easeInOut" } }}
                      />
                    )}
                  </AnimatePresence>
                )}
                <FileText className="size-[13px] shrink-0 text-zinc-400" />
                <span className="font-medium">{invoice.month}</span>
                <span className="flex-1 font-mono text-[10px] text-zinc-400">{invoice.number}</span>
                <span className="text-zinc-500 tabular">$49.00</span>
                <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[9.5px] font-medium text-emerald-700">Paid</span>
                <Download className="size-[13px] shrink-0 text-zinc-500" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className={cn(CARD, "p-3")}>
            <p className="text-[11px] font-semibold">Payment method</p>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="grid h-[22px] w-[34px] place-items-center rounded-[5px] bg-[#1a1f71] text-[8px] font-bold tracking-wide text-white italic">VISA</span>
              <div className="leading-tight">
                <p className="text-[11px] font-medium">Visa ending 4242</p>
                <p className="text-[10px] text-zinc-500">Expires 08/28</p>
              </div>
            </div>
          </div>
          <div className={cn(CARD, "p-3 text-[11px]")}>
            <p className="font-semibold">Billing details</p>
            <p className="mt-2 text-zinc-600">Northwind Inc.</p>
            <p className="text-zinc-500">billing@northwind.co</p>
          </div>
        </div>
      </Columns>
    </Page>
  );
}

const EARLIER_IMPORTS = [
  { file: "webinar-signups.csv", count: "312 contacts" },
  { file: "trade-show.csv", count: "1,204 contacts" },
  { file: "newsletter.csv", count: "2,870 contacts" },
];

const COLUMN_MATCHES = [
  { from: "Email", to: "email" },
  { from: "Full name", to: "name" },
  { from: "Company", to: "company" },
  { from: "Signed up", to: "created_at" },
];

function Price({ annual, className }: { annual: boolean; className?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={annual ? "annual" : "monthly"}
          className={cn("font-semibold tracking-[-0.02em] tabular", className)}
          initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          {annual ? "$490" : "$49"}
        </motion.span>
      </AnimatePresence>
      <span className="text-[10.5px] font-normal text-zinc-500">{annual ? "per year" : "per month"}</span>
    </span>
  );
}

function ImportPage({ layout }: { layout: SceneLayout }) {
  return (
    <Page layout={layout} title="Import contacts" sub="Bring people in from a CSV file.">
      <Columns layout={layout}>
        <div className="flex flex-col gap-3">
          <div className={cn(CARD, "p-3")}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-emerald-50 text-emerald-700">
                <FileSpreadsheet className="size-4" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[11.5px] font-medium">contacts.csv</p>
                <p className="text-[10px] text-zinc-500">8.2 MB</p>
              </div>
              <Loader2 className="size-[14px] shrink-0 animate-spin text-zinc-400 motion-reduce:animate-none" />
            </div>
            <div className="relative mt-3 h-[5px] overflow-hidden rounded-full bg-zinc-100">
              <div className="absolute inset-y-0 left-0 w-[64%] overflow-hidden rounded-full bg-zinc-800">
                <motion.span
                  className="absolute inset-y-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.45),transparent)]"
                  animate={{ x: ["-100%", "220%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-zinc-500">
              <span>Importing…</span>
              <span className="tabular">64%</span>
            </div>
          </div>
          <div className={CARD}>
            <CardHeader title="Earlier imports" />
            {EARLIER_IMPORTS.map((item) => (
              <div key={item.file} className="flex items-center gap-2 border-b border-zinc-100 px-3 py-[7px] text-[11px] last:border-b-0">
                <Check className="size-[13px] shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1 truncate font-medium">{item.file}</span>
                <span className="text-zinc-500 tabular">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <CardHeader title="Match your columns" />
          {COLUMN_MATCHES.map((match) => (
            <div key={match.from} className="flex items-center gap-2 border-b border-zinc-100 px-3 py-[7px] text-[11px] last:border-b-0">
              <span className="w-[90px] font-medium">{match.from}</span>
              <ArrowRight className="size-3 text-zinc-300" />
              <span className="rounded-[5px] bg-zinc-100 px-1.5 py-px font-mono text-[10px] text-zinc-600">{match.to}</span>
            </div>
          ))}
        </div>
      </Columns>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// The assistant's panel, as it looks on a call

function CallPanel({ layout, call, chapter, fade }: { layout: SceneLayout; call: Frame["call"]; chapter: number; fade: number }) {
  const wide = layout === "wide";
  const chat = call.mode === "chat";

  return (
    <div
      className="absolute z-20 flex flex-col overflow-hidden rounded-[20px] bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.06),0_30px_64px_-18px_rgb(50_35_15/0.35)]"
      style={BOX[layout].panel}
    >
      <ChevronDown className="absolute top-3 right-3 size-[15px] text-zinc-400" />
      {wide ? (
        <div className={cn("flex shrink-0 flex-col items-center transition-[padding] duration-300", chat ? "pt-4" : "pt-5")}>
          <VoiceOrb size={chat ? 34 : 58} level={call.level} thinking={call.status === "Thinking…"} />
          <p className="mt-2 text-[12.5px] font-semibold">{BRAND.name}</p>
          <p className={cn("h-[15px] text-[11px] text-zinc-500 transition-opacity duration-200", chat && "opacity-0")} aria-hidden={chat}>
            {call.status}
          </p>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5">
          <VoiceOrb size={32} level={call.level} thinking={call.status === "Thinking…"} />
          <div className="leading-tight">
            <p className="text-[12.5px] font-semibold">{BRAND.name}</p>
            <p className="text-[11px] text-zinc-500">{chat ? "Chat" : call.status}</p>
          </div>
        </div>
      )}

      <motion.div
        className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 pt-3 pb-2.5 [mask-image:linear-gradient(to_bottom,transparent,black_26px)]"
        animate={{ opacity: fade }}
        transition={{ duration: 0.1 }}
      >
        <AnimatePresence initial={false}>
          {call.messages.map((message) => (
            <PanelMessage key={`${chapter}-${message.id}`} message={message} />
          ))}
        </AnimatePresence>
      </motion.div>

      <div className="flex h-[58px] shrink-0 items-center justify-center gap-3 border-t border-zinc-100 px-3">
        <AnimatePresence mode="wait" initial={false}>
          {chat ? (
            <motion.div
              key="composer"
              className="flex w-full items-center gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              <div className="flex h-[36px] min-w-0 flex-1 items-center rounded-full border border-accent px-3 text-[11.5px] shadow-[0_0_0_3px_rgb(99_82_242/0.12)]">
                {call.draft ? <span className="truncate">{call.draft}</span> : <span className="text-zinc-400">Message {BRAND.name}</span>}
                <span className="ml-px h-[14px] w-px shrink-0 animate-pulse bg-zinc-900 motion-reduce:animate-none" />
              </div>
              <span
                className={cn(
                  "grid size-[34px] shrink-0 place-items-center rounded-full bg-accent text-white transition-opacity",
                  !call.draft && "opacity-40",
                )}
              >
                <ArrowUp className="size-[15px]" />
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="controls"
              className="flex items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              <span className="grid size-[34px] place-items-center rounded-full bg-white text-zinc-800 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.06)]">
                <Mic className="size-[15px]" />
              </span>
              <span className="grid size-[40px] place-items-center rounded-full bg-danger text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_6px_14px_-6px_rgb(220_38_38/0.7)]">
                <PhoneOff className="size-[16px]" />
              </span>
              <motion.span
                className={cn(
                  "grid size-[34px] place-items-center rounded-full transition-colors duration-150",
                  call.pressed ? "bg-zinc-900 text-white" : "bg-white text-zinc-800 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.06)]",
                )}
                animate={{ scale: call.pressed ? 0.88 : 1 }}
                transition={{ duration: 0.12 }}
              >
                <Keyboard className="size-[15px]" />
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function VoiceOrb({ size, level, thinking }: { size: number; level: number; thinking: boolean }) {
  return (
    <motion.div
      className="relative grid shrink-0 place-items-center"
      initial={false}
      animate={{ width: size, height: size }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
    >
      <span
        className="absolute inset-0 rounded-full bg-accent blur-[12px] transition-[opacity,transform] duration-100"
        style={{ opacity: 0.16 + level * 0.5, transform: `scale(${1 + level * 0.4})` }}
      />
      <span
        className={cn(
          "orb-fill relative size-[78%] rounded-full transition-transform duration-100",
          !level && "animate-orb-breathe",
          thinking && "animate-pulse",
          "motion-reduce:animate-none",
        )}
        style={{
          transform: level ? `scale(${1 + level * 0.12})` : undefined,
          boxShadow: "inset 0 -6px 14px rgb(9 9 11 / 0.18), 0 10px 22px -10px rgb(99 82 242 / 0.75)",
        }}
      />
    </motion.div>
  );
}

function PanelMessage({ message }: { message: Message }) {
  const enter = {
    layout: "position" as const,
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.28, ease: EASE_OUT },
  };

  if (message.role === "activity") {
    return (
      <motion.div {...enter} className="mt-2.5 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1 text-[10.5px] font-medium text-zinc-500 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]">
          {message.running ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> : <Sparkles className="size-3 text-accent" />}
          {message.text}
        </span>
      </motion.div>
    );
  }

  const user = message.role === "user";
  return (
    <motion.div {...enter} className={cn("mt-2 flex", user ? "justify-end pl-7" : "pr-5")}>
      <p
        className={cn(
          "px-3 py-[7px] text-[11.5px] leading-[1.45] transition-opacity duration-200",
          user ? "rounded-[15px] rounded-br-[5px] bg-accent text-white" : "rounded-[15px] rounded-bl-[5px] bg-zinc-100 text-zinc-900",
          message.pending && "opacity-55",
        )}
      >
        {message.text}
      </p>
    </motion.div>
  );
}

// Words in the visitor's own message that the write-up uses.
function Marked({ text, marks }: { text: string; marks: { phrase: string; on: boolean }[] }) {
  const pattern = new RegExp(`(${marks.map((mark) => mark.phrase).join("|")})`);
  return text.split(pattern).map((part, index) => {
    const mark = marks.find((item) => item.phrase === part);
    if (!mark) return part;
    return (
      <span
        key={index}
        className={cn(
          "-mx-px rounded-[3px] px-px transition-colors duration-300",
          mark.on ? "bg-amber-200 text-zinc-900" : "bg-transparent",
        )}
      >
        {part}
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// Behind the scenes

function Note({
  icon,
  title,
  status,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  status?: React.ReactNode;
  rows: { key: string; value: React.ReactNode; hot?: boolean }[];
}) {
  return (
    <div className="rounded-[14px] bg-[#171512] p-3 text-white shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_24px_48px_-16px_rgb(20_15_5/0.6)]">
      <div className="flex items-center gap-2 text-[11.5px] font-medium">
        {icon}
        <span className="text-white/90">{title}</span>
        {status && <span className="ml-auto">{status}</span>}
      </div>
      <div className="mt-2.5 flex flex-col gap-[7px] border-t border-white/[0.08] pt-2.5 font-mono text-[10.5px]">
        {rows.map((row, index) => (
          <motion.div
            key={row.key}
            className="flex items-baseline gap-3"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT, delay: 0.15 + index * 0.18 }}
          >
            <span className="w-[62px] shrink-0 text-white/40">{row.key}</span>
            <span className={cn("min-w-0 flex-1 truncate transition-colors duration-300", row.hot ? "text-[#c4b5fd]" : "text-white/85")}>
              {row.value}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// What comes with every message: the page, who's signed in, and the site map.
function ContextNote({ found }: { found: boolean }) {
  return (
    <Note
      icon={<span className="orb-fill size-3.5 rounded-full" />}
      title="What it knows"
      rows={[
        { key: "page", value: "/dashboard" },
        { key: "user", value: "Maya Chen, signed in" },
        {
          key: "site map",
          hot: found,
          value: (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={found ? "found" : "all"}
                className="inline-block"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {found ? "Billing → /billing" : "42 pages"}
              </motion.span>
            </AnimatePresence>
          ),
        },
      ]}
    />
  );
}

// The Stripe call it made, locked to the signed-in customer.
function ActionNote({ done, verified }: { done: boolean; verified: boolean }) {
  return (
    <Note
      icon={
        <span className="grid size-[18px] place-items-center rounded-[5px] bg-[#635bff]">
          <StripeMark className="size-[11px] text-white" />
        </span>
      }
      title="Change plan"
      status={
        <AnimatePresence mode="popLayout" initial={false}>
          {done ? (
            <motion.span
              key="done"
              className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-medium text-emerald-300"
              initial={{ opacity: 0, scale: 0.4, filter: "blur(3px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            >
              <Check className="size-3" /> Done
            </motion.span>
          ) : (
            <motion.span key="running" className="flex items-center gap-1 text-[10px] text-white/50" exit={{ opacity: 0, scale: 0.4 }}>
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> Running
            </motion.span>
          )}
        </AnimatePresence>
      }
      rows={[
        { key: "customer", value: verified ? "Maya Chen ✓ verified" : "Maya Chen", hot: verified },
        { key: "plan", value: "Pro monthly → annual" },
        { key: "price", value: "$490 / year" },
      ]}
    />
  );
}

// The insight, as the team finds it in the dashboard.
function InsightCard({ time }: { time: number }) {
  const T = INSIGHTS;
  const title = wordsAt("Contact import hangs on an 8 MB CSV", T.title[0], T.title[1], time);
  const details = wordsAt(
    "Tried three times today. The progress bar stops at 64% and never finishes. Expected the contacts to import, or an error saying why.",
    T.details[0],
    T.details[1],
    time,
  );

  return (
    <div className="rounded-[16px] bg-white p-4 text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_16px_-6px_rgb(0_0_0/0.08),0_36px_72px_-20px_rgb(50_35_15/0.45)]">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <LogoMark className="size-4" />
        <span className="font-medium text-zinc-700">{BRAND.name}</span>
        <span>·</span>
        <span>Insights</span>
        <span className="ml-auto">just now</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-medium text-red-700">Bug</span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">High</span>
      </div>
      <div className="mt-2 min-h-[20px]">
        {title ? (
          <p className="text-[14px] leading-snug font-semibold tracking-[-0.01em]">{title}</p>
        ) : (
          <span className="mt-1 block h-[11px] w-3/4 animate-pulse rounded-full bg-zinc-100 motion-reduce:animate-none" />
        )}
      </div>
      <div className="mt-1.5 min-h-[54px]">
        {details ? (
          <p className="text-[11.5px] leading-relaxed text-zinc-600">{details}</p>
        ) : (
          <div className="flex flex-col gap-2 pt-1.5">
            <span className="block h-[8px] w-full animate-pulse rounded-full bg-zinc-100 motion-reduce:animate-none" />
            <span className="block h-[8px] w-5/6 animate-pulse rounded-full bg-zinc-100 motion-reduce:animate-none" />
            <span className="block h-[8px] w-2/3 animate-pulse rounded-full bg-zinc-100 motion-reduce:animate-none" />
          </div>
        )}
      </div>
      <motion.div
        className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-zinc-100 pt-2.5 text-[10.5px] text-zinc-500"
        initial={false}
        animate={{ opacity: time >= T.meta ? 1 : 0, y: time >= T.meta ? 0 : 4 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        <span>maya@northwind.co</span>
        <span className="font-mono text-[10px]">/contacts/import</span>
        <span className="font-medium text-accent-ink">Open conversation</span>
      </motion.div>
    </div>
  );
}
