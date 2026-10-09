"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { Check, CreditCard, LayoutGrid, Loader2, Mic, Pause, Play, Plug, Settings, Users } from "lucide-react";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/dashboard/logo";
import { StripeMark } from "@/components/brand/stripe-logo";
import { cn } from "@/lib/utils";
import { between, EASE_OUT, useScene } from "./motion";

// A short film of a call on someone's SaaS app, with subtitles. The visitor is
// lost; the assistant takes her to the right page, zooms in on the button she
// needs, and once she's done, the team gets an insight about what tripped her up.
const LOOP = 20;
const STILL = 17.4;
const VISITOR = "Maya";

type Line = { who: "visitor" | "assistant"; text: string; start: number; end: number };

const LINES: Line[] = [
  { who: "visitor", text: "I'm trying to connect Stripe and I'm kind of lost.", start: 0.6, end: 3 },
  { who: "assistant", text: "No problem, let me take you there.", start: 3.8, end: 5.3 },
  { who: "assistant", text: "Press Connect next to Stripe. I'll point it out.", start: 6, end: 8.4 },
  { who: "assistant", text: "Done, Stripe is connected. Anything else?", start: 11.4, end: 13.4 },
  { who: "visitor", text: "Nope, that's perfect. Thanks!", start: 14.1, end: 15.5 },
];

const T = {
  navigate: 5,
  zoomIn: [7.1, 8.3],
  point: 7.7,
  cursor: [8.8, 9.8],
  press: 9.95,
  connected: 10.9,
  zoomOut: [11.1, 12.3],
  insight: 15.9,
  fadeOut: 19.4,
} as const;

// Where a lost visitor's pointer drifts on the dashboard, as fractions of the app.
const WANDER = [
  { t: 0, x: 0.72, y: 0.72 },
  { t: 1.2, x: 0.32, y: 0.42 },
  { t: 2.3, x: 0.12, y: 0.68 },
  { t: 3.4, x: 0.56, y: 0.34 },
];

// Several Connect buttons, so pointing at the right one matters. Phones show the first three.
const INTEGRATIONS = [
  { name: "Slack", text: "Send alerts to channels", tile: "bg-[#4a154b]", connected: true },
  { name: "Stripe", text: "Sync payments and subscriptions", tile: "bg-[#635bff]", stripe: true },
  { name: "HubSpot", text: "Keep contacts in sync", tile: "bg-[#ff7a59]" },
  { name: "Intercom", text: "Bring in support history", tile: "bg-[#1f8ded]" },
  { name: "Zapier", text: "Automate with 7,000 apps", tile: "bg-[#ff4f00]" },
  { name: "Segment", text: "Send product events", tile: "bg-[#52bd94]", connected: true },
];

const STATS = [
  { label: "Revenue", value: "$48,210", delta: "+6.2%" },
  { label: "Active customers", value: "1,284", delta: "+38" },
  { label: "Churn", value: "1.9%", delta: "−0.3%" },
];
const CHART = [82, 74, 78, 63, 67, 55, 59, 47, 51, 39, 43, 31, 34, 22];
const CHART_LINE = CHART.map((y, index) => `${index ? "L" : "M"}${((index / (CHART.length - 1)) * 400).toFixed(1)} ${y}`).join(" ");

// Film grain for the stage.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const CARD = "shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_1px_2px_rgb(0_0_0/0.04)]";

type Box = { x: number; y: number; w: number; h: number };

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const progressIn = (t: number, [from, to]: readonly [number, number]) => Math.min(1, Math.max(0, (t - from) / (to - from)));

function speakingAt(time: number, who: Line["who"]) {
  return LINES.some((line) => line.who === who && between(time, line.start, line.end + 0.25));
}

// Position of `element` inside `container`. Offsets ignore transforms, so this holds while zoomed.
function offsetIn(element: HTMLElement, container: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node ? { x, y, w: element.offsetWidth, h: element.offsetHeight } : null;
}

function pointerAt(t: number, width: number, height: number, target: Box | null) {
  const last = WANDER[WANDER.length - 1];
  if (t < last.t) {
    const next = WANDER.findIndex((point) => point.t > t);
    const from = WANDER[next - 1];
    const to = WANDER[next];
    const k = ease(progressIn(t, [from.t, to.t]));
    return { x: (from.x + (to.x - from.x) * k) * width, y: (from.y + (to.y - from.y) * k) * height };
  }
  const rest = { x: last.x * width, y: last.y * height };
  if (!target || t < T.cursor[0]) return rest;
  const on = { x: target.x + target.w * 0.55, y: target.y + target.h * 0.6 };
  if (t < T.cursor[1]) {
    const k = ease(progressIn(t, T.cursor));
    return { x: rest.x + (on.x - rest.x) * k, y: rest.y + (on.y - rest.y) * k };
  }
  // After the click, it drifts off the button.
  const k = ease(progressIn(t, [T.connected + 0.3, T.connected + 1.4]));
  return { x: on.x + 70 * k, y: on.y + 46 * k };
}

export function HeroDemo() {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  // Visitors who prefer reduced motion see the finished scene, and can play it themselves.
  const [optedIn, setOptedIn] = useState(false);
  const { ref, time, timeRef, visible } = useScene<HTMLDivElement>(LOOP, STILL, { paused, playWhenReduced: optedIn });
  const running = !paused && (!reduce || optedIn);

  const page = time >= T.navigate ? "integrations" : "dashboard";

  // Camera, pointer and progress change every frame, so they're read straight off the clock.
  const appRef = useRef<HTMLDivElement>(null);
  const connectRef = useRef<HTMLSpanElement>(null);
  const zoom = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const fade = useMotionValue(1);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const pointerScale = useMotionValue(1);
  const played = useMotionValue("0%");

  useAnimationFrame(() => {
    const app = appRef.current;
    if (!app || !visible) return;
    const t = timeRef.current;
    const width = app.offsetWidth;
    const height = app.offsetHeight;

    // The camera: while the assistant points, zoom in and pan the Connect button
    // toward the middle, without ever showing past the edges of the app.
    const target = connectRef.current && offsetIn(connectRef.current, app);
    const max = width < 640 ? 1.18 : 1.32;
    const amount = t < T.zoomOut[0] ? ease(progressIn(t, T.zoomIn)) : 1 - ease(progressIn(t, T.zoomOut));
    const scale = 1 + (max - 1) * amount;
    zoom.set(scale);
    if (target) {
      const focus = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
      const clamp = (value: number, size: number) => Math.min(0, Math.max(size * (1 - scale), value));
      // Where the button lands: most of the way from where it is to the centre.
      const landX = focus.x + (width / 2 - focus.x) * 0.65 * amount;
      const landY = focus.y + (height / 2 - focus.y) * 0.65 * amount;
      panX.set(clamp(landX - focus.x * scale, width));
      panY.set(clamp(landY - focus.y * scale, height));
    } else {
      panX.set(0);
      panY.set(0);
    }

    const pointer = pointerAt(t, width, height, target);
    pointerX.set(pointer.x);
    pointerY.set(pointer.y);
    pointerScale.set(between(t, T.press - 0.08, T.press + 0.14) ? 0.82 : 1);

    // Fade out and back in where the loop restarts.
    fade.set(t < 0.35 ? t / 0.35 : t > T.fadeOut ? Math.max(0, 1 - (t - T.fadeOut) / (LOOP - T.fadeOut)) : 1);
    played.set(`${(t / LOOP) * 100}%`);
  });

  // On wide screens the app leans back a little and straightens as you scroll to it.
  const { scrollY } = useScroll();
  const rotateX = useTransform(scrollY, [0, 520], [10, 0]);
  const lift = useTransform(scrollY, [0, 520], [0.94, 1]);
  const [tilt, setTilt] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setTilt(query.matches && !reduce);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [reduce]);

  const loading = between(time, T.navigate - 0.25, T.navigate + 0.5);

  return (
    <div ref={ref} className="relative overflow-hidden rounded-[22px] bg-[#131110] sm:rounded-[30px]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_0%,rgb(255_244_230/0.09),transparent_70%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay" style={{ backgroundImage: GRAIN }} aria-hidden />

      <div className="relative px-2.5 pt-2.5 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16">
        <motion.div
          style={tilt ? { rotateX, scale: lift, transformPerspective: 2000, originY: 1 } : undefined}
          className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[14px] bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(255_255_255/0.07),0_40px_90px_-30px_rgb(0_0_0/0.85)] sm:rounded-[16px]"
        >
          {/* Browser chrome */}
          <div className="relative flex h-9 items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-3.5 sm:h-10">
            <span className="size-2.5 rounded-full bg-zinc-300" />
            <span className="size-2.5 rounded-full bg-zinc-300" />
            <span className="size-2.5 rounded-full bg-zinc-300" />
            <span className="mx-auto hidden min-w-[270px] justify-center rounded-md bg-white px-3 py-0.5 font-mono text-[11px] text-zinc-500 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:flex">
              app.acme.io/
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={page}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {page === "dashboard" ? "dashboard" : "settings/integrations"}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="hidden w-[46px] sm:block" />
            {/* Page load when the assistant moves the page */}
            <span
              className={cn(
                "absolute -bottom-px left-0 h-[2px] bg-sky-500 transition-opacity duration-200",
                loading ? "opacity-100" : "opacity-0",
              )}
              style={{ width: `${progressIn(time, [T.navigate - 0.25, T.navigate + 0.35]) * 100}%` }}
            />
          </div>

          <div className="relative overflow-hidden">
            <motion.div
              ref={appRef}
              style={{ x: panX, y: panY, scale: zoom, originX: 0, originY: 0, opacity: fade }}
              className="relative grid h-[400px] grid-cols-[48px_minmax(0,1fr)] sm:h-[480px] xl:grid-cols-[200px_minmax(0,1fr)]"
            >
              <Sidebar page={page} />
              <div className="p-4 sm:p-9">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={page}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                  >
                    {page === "dashboard" ? (
                      <DashboardPage />
                    ) : (
                      <IntegrationsPage time={time} connectRef={connectRef} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* The visitor's pointer */}
              <motion.svg
                viewBox="0 0 24 24"
                style={{ x: pointerX, y: pointerY, scale: pointerScale }}
                className="pointer-events-none absolute top-0 left-0 z-20 size-[22px] origin-top-left drop-shadow-[0_2px_3px_rgb(0_0_0/0.3)]"
                aria-hidden
              >
                <path d="M5 3l14 8.5-6.2 1.3L9.5 19z" fill="#18181b" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
              </motion.svg>
            </motion.div>

            <Launcher time={time} speaking={speakingAt(time, "assistant")} />
          </div>
        </motion.div>

        {/* What the team sees afterwards */}
        <AnimatePresence>
          {between(time, T.insight, T.fadeOut) && (
            <motion.div
              key="insight"
              className="absolute top-14 right-4 z-10 w-[236px] rounded-[18px] bg-white p-3.5 text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_30px_60px_-20px_rgb(0_0_0/0.7)] sm:top-auto sm:right-auto sm:-bottom-7 sm:left-6 sm:w-[300px] sm:p-4 lg:left-10"
              initial={{ opacity: 0, y: 16, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 8, scale: 0.98, filter: "blur(4px)" }}
              transition={{ type: "spring", duration: 0.6, bounce: 0.15 }}
            >
              <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                <LogoMark className="size-4" />
                New insight
                <span className="ml-auto">now</span>
              </div>
              <p className="mt-2.5 text-[14px] leading-snug font-semibold sm:text-[14.5px]">Couldn&apos;t find where to connect Stripe</p>
              <div className="mt-3 flex items-center gap-2 text-[12px]">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Confusion</span>
                <span className="text-zinc-500">12 people this week</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Captions time={time} />

      <div className="relative flex items-center gap-3 px-4 pb-4 sm:px-10 sm:pb-7 lg:px-16">
        <button
          type="button"
          onClick={() => {
            if (running) return setPaused(true);
            setPaused(false);
            setOptedIn(true);
          }}
          aria-label={running ? "Pause the demo" : "Play the demo"}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/75 transition-colors duration-150 hover:bg-white/[0.14] hover:text-white"
        >
          {running ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5 translate-x-px" fill="currentColor" />}
        </button>
        <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.12]" aria-hidden>
          <motion.span className="absolute inset-y-0 left-0 rounded-full bg-white/60" style={{ width: played }} />
        </div>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// The customer's app

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "customers", label: "Customers", icon: Users },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "settings", label: "Settings", icon: Settings },
];

function Sidebar({ page }: { page: string }) {
  const id = useId();
  return (
    <div className="border-r border-zinc-200 bg-zinc-50/70 p-1.5 xl:p-3.5">
      <div className="mb-5 hidden items-center gap-2 px-2 pt-1 xl:flex">
        <span className="size-5 rounded-md bg-zinc-900" />
        <span className="text-[13px] font-semibold">Acme</span>
      </div>
      {NAV.map((item) => {
        const active = item.key === page;
        return (
          <div key={item.key} className="relative mb-1 flex items-center justify-center gap-2.5 rounded-[9px] px-2 py-2 text-[13px] xl:justify-start">
            {active && (
              <motion.span
                layoutId={`${id}-active`}
                className="absolute inset-0 rounded-[9px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.05)]"
                transition={{ type: "spring", duration: 0.5, bounce: 0 }}
              />
            )}
            <item.icon className={cn("relative size-4 shrink-0 transition-colors", active ? "text-zinc-900" : "text-zinc-500")} />
            <span className={cn("relative hidden transition-colors xl:inline", active ? "font-medium text-zinc-900" : "text-zinc-500")}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardPage() {
  return (
    <>
      <p className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">Good morning, {VISITOR}</p>
      <p className="mt-1 text-[13.5px] text-zinc-500">Here&apos;s how Acme is doing this week.</p>
      <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {STATS.map((stat, index) => (
          <div key={stat.label} className={cn("rounded-[14px] bg-white p-3.5", CARD, index === 2 && "hidden md:block")}>
            <p className="truncate text-[12px] text-zinc-500">{stat.label}</p>
            <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em] sm:text-[22px]">{stat.value}</p>
            <p className="mt-0.5 text-[11.5px] font-medium text-emerald-600">{stat.delta}</p>
          </div>
        ))}
      </div>
      <div className={cn("mt-2.5 rounded-[14px] bg-white p-4", CARD)}>
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-medium">Revenue</p>
          <p className="text-[11.5px] text-zinc-500">Last 30 days</p>
        </div>
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="mt-3 h-[110px] w-full sm:h-[150px]" aria-hidden>
          <path d={`${CHART_LINE} L400 100 L0 100 Z`} fill="rgb(24 24 27 / 0.05)" />
          <path d={CHART_LINE} fill="none" stroke="#18181b" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </>
  );
}

function IntegrationsPage({ time, connectRef }: { time: number; connectRef: React.RefObject<HTMLSpanElement | null> }) {
  const state = time < T.press + 0.1 ? "idle" : time < T.connected ? "connecting" : "done";
  const pointing = between(time, T.point, T.press + 0.1);

  return (
    <>
      <p className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">Integrations</p>
      <p className="mt-1 text-[13.5px] text-zinc-500">Connect the tools your team already uses.</p>
      <div className="mt-6 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {INTEGRATIONS.map((integration, index) => (
          <div
            key={integration.name}
            className={cn("flex items-center gap-3 rounded-[14px] bg-white p-3 sm:gap-4 sm:p-3.5", CARD, index >= 3 && "hidden md:flex")}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[15px] font-semibold text-white sm:size-10",
                integration.tile,
              )}
            >
              {integration.stripe ? <StripeMark className="size-4.5" /> : integration.name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">{integration.name}</p>
              <p className="truncate text-[12.5px] text-zinc-500">{integration.text}</p>
            </div>
            {integration.stripe ? (
              <span ref={connectRef} className="relative shrink-0">
                <StripeAction state={state} pointing={pointing} pressed={between(time, T.press - 0.08, T.press + 0.14)} />
              </span>
            ) : integration.connected ? (
              <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-emerald-700">
                <Check className="size-3.5" /> Connected
              </span>
            ) : (
              <span className="shrink-0 rounded-[9px] bg-zinc-900 px-3.5 py-1.5 text-[13px] font-medium text-white">Connect</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function StripeAction({ state, pointing, pressed }: { state: "idle" | "connecting" | "done"; pointing: boolean; pressed: boolean }) {
  if (state === "done") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12.5px] font-medium text-emerald-700"
      >
        <Check className="size-3.5" /> Connected
      </motion.span>
    );
  }
  if (state === "connecting") {
    return (
      <span className="flex items-center gap-1.5 rounded-[9px] bg-zinc-100 px-3 py-1.5 text-[13px] font-medium text-zinc-600">
        <Loader2 className="size-3.5 animate-spin" /> Connecting
      </span>
    );
  }
  return (
    <>
      <AnimatePresence>
        {pointing && (
          <motion.span
            key="ring"
            className="absolute -inset-1.5 rounded-[13px] border-[2.5px] border-accent"
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{
              opacity: 1,
              scale: 1,
              boxShadow: ["0 0 0 4px rgb(99 82 242 / 0.28)", "0 0 0 12px rgb(99 82 242 / 0)", "0 0 0 4px rgb(99 82 242 / 0.28)"],
            }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: EASE_OUT, boxShadow: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } }}
          />
        )}
      </AnimatePresence>
      <motion.span
        className="relative block rounded-[9px] bg-zinc-900 px-3.5 py-1.5 text-[13px] font-medium text-white"
        animate={{ scale: pressed ? 0.93 : 1 }}
        transition={{ duration: 0.12 }}
      >
        Connect
      </motion.span>
    </>
  );
}

// The real launcher during a minimized call: green, with its wave following the assistant's voice.
const BARS = [5, 9, 14, 18, 12, 8, 5];

function Launcher({ time, speaking }: { time: number; speaking: boolean }) {
  return (
    <div className="absolute right-3 bottom-3 z-30 flex h-11 items-center gap-2 rounded-full bg-[#09090b] pr-4 pl-1 text-[13.5px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_4px_8px_-2px_rgb(0_0_0/0.12),0_16px_32px_-8px_rgb(0_0_0/0.32)] sm:right-5 sm:bottom-5 sm:h-[52px] sm:gap-2.5 sm:pr-5 sm:pl-1.5 sm:text-[15px]">
      <span className="relative grid size-9 place-items-center sm:size-10" style={{ ["--accent" as string]: "#059669" }}>
        <motion.span
          className="absolute -inset-[3px] rounded-full bg-[#059669] blur-[8px]"
          animate={{ opacity: [0.55, 0.15, 0.55], scale: [1, 1.18, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="orb-fill absolute inset-0 rounded-full shadow-[inset_0_-3px_6px_rgb(0_0_0/0.2)]" />
        <span className="relative flex h-[18px] items-center gap-[2px]">
          {BARS.map((height, index) => {
            const level = 0.25 + 0.75 * Math.abs(Math.sin(time * (7 + index * 1.7) + index));
            return (
              <i
                key={index}
                className="block w-[2px] rounded-full bg-white transition-[height] duration-100 ease-linear"
                style={{ height: speaking ? 3 + level * 15 : height }}
              />
            );
          })}
        </span>
      </span>
      Back to call
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subtitles

function Captions({ time }: { time: number }) {
  // When the assistant answers the visitor, its line shows a beat early, while it's thinking.
  let index = 0;
  LINES.forEach((line, i) => {
    const answering = line.who === "assistant" && LINES[i - 1]?.who === "visitor";
    if (time >= line.start - (answering ? 0.8 : 0.15)) index = i;
  });
  const line = LINES[index];
  const words = line.text.split(" ");
  const spoken = time < line.start ? 0 : Math.max(1, Math.ceil(progressIn(time, [line.start, line.end]) * words.length));
  const assistant = line.who === "assistant";
  const thinking = assistant && time < line.start;

  return (
    <div className="relative mx-auto flex min-h-[150px] max-w-[900px] items-center justify-center px-4 pt-7 pb-5 text-center sm:min-h-[196px] sm:pt-10 sm:pb-7">
      <motion.div className="w-full" animate={{ opacity: time >= T.fadeOut ? 0 : 1 }} transition={{ duration: 0.4 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <p className="flex items-center justify-center gap-2 text-[13px] font-medium text-white/55">
              {assistant ? <LogoMark className="size-4" /> : <Mic className="size-3.5" />}
              {assistant ? BRAND.name : VISITOR}
              {speakingAt(time, line.who) && <VoiceBars />}
            </p>
            {thinking ? (
              <div className="flex h-[52px] items-center justify-center gap-1.5 sm:h-[88px]" aria-label="Thinking">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-2 rounded-full bg-white/70"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1, repeat: Infinity, delay: dot * 0.16 }}
                  />
                ))}
              </div>
            ) : (
              <p
                className={cn(
                  "spoken mt-2.5 text-[23px] leading-[1.22] text-balance sm:text-[36px] lg:text-[42px]",
                  !assistant && "italic",
                )}
              >
                {words.map((word, i) => (
                  <span key={i} className={cn("transition-colors duration-200", i < spoken ? "text-white" : "text-white/20")}>
                    {word}{" "}
                  </span>
                ))}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function VoiceBars() {
  return (
    <span className="flex h-3 items-center gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map((bar) => (
        <span
          key={bar}
          className="h-full w-[2px] rounded-full bg-white/60 animate-wave"
          style={{ animationDelay: `${-bar * 160}ms`, animationDuration: `${420 + bar * 80}ms` }}
        />
      ))}
    </span>
  );
}
