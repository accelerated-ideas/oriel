"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Check, CornerDownRight, FileText, Globe, Lock, Paperclip } from "lucide-react";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import { WaveIcon } from "@/components/ui/wave-icon";
import { EASE_OUT, Reveal, usePrefersReducedMotion, useScene } from "./motion";

const G = BRAND.embedGlobal;

// Icons on the dark panels use solid greys, not see-through white: with
// transparency, the places where an icon's strokes overlap show as seams.
// These match the shades the see-through whites gave on this panel.
const ICON = "text-[#888785]";
const ICON_FAINT = "text-[#6c6b69]";
const STEP_SECONDS = 7;

export function Setup({ scriptUrl }: { scriptUrl: string }) {
  const steps = [
    {
      key: "teach",
      title: "Teach it your product",
      text: "Point it at your site and docs, upload files, and list the pages it can take people to.",
      file: "Knowledge",
      panel: <TeachPanel />,
    },
    {
      key: "hands",
      title: "Give it hands",
      text: "Switch on Stripe, describe your endpoints in a form, or register functions from your app. It works out when to use each one.",
      file: "app.ts",
      panel: <HandsPanel />,
    },
    {
      key: "install",
      title: "Add one script tag",
      text: "Paste the snippet on your site. Sign who's logged in on your server, and it can act on their account.",
      file: "index.html",
      panel: <InstallPanel scriptUrl={scriptUrl} />,
    },
  ];

  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.4 });
  const reduce = usePrefersReducedMotion();
  const running = visible && !pinned && !reduce;

  // Move through the steps while they're on screen, until someone picks one.
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setActive((index) => (index + 1) % steps.length), STEP_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [active, running, steps.length]);

  const step = steps[active];

  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 rounded-[22px] bg-[#141210] px-5 py-20 text-white sm:rounded-[30px] sm:px-10 sm:py-28 lg:px-16"
    >
      <Reveal>
        <h2 className="headline max-w-[760px] text-[40px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[60px]">
          Live on your site in an afternoon
        </h2>
      </Reveal>

      <div ref={ref} className="mt-12 grid grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div role="tablist" aria-orientation="vertical" className="flex flex-col border-t border-white/12">
          {steps.map((item, index) => {
            const selected = index === active;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`setup-tab-${item.key}`}
                aria-selected={selected}
                aria-controls="setup-panel"
                onClick={() => {
                  setActive(index);
                  setPinned(true);
                }}
                className="group relative border-b border-white/12 py-6 text-left sm:py-7"
              >
                <span
                  className={cn(
                    "headline block text-[24px] leading-tight font-semibold tracking-[-0.03em] transition-colors duration-200 sm:text-[28px]",
                    selected ? "text-white" : "text-white/40 group-hover:text-white/70",
                  )}
                >
                  {item.title}
                </span>
                <AnimatePresence initial={false}>
                  {selected && (
                    <motion.span
                      key="text"
                      className="block overflow-hidden"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT }}
                    >
                      <span className="block max-w-[440px] pt-3 text-[16px] leading-relaxed text-pretty text-white/65">
                        {item.text}
                      </span>
                    </motion.span>
                  )}
                </AnimatePresence>
                {selected && (
                  <span className="absolute -bottom-px left-0 h-px w-full overflow-hidden" aria-hidden>
                    <motion.span
                      key={`${active}-${running}`}
                      className="block h-full bg-white"
                      initial={{ width: running ? "0%" : "100%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: running ? STEP_SECONDS : 0, ease: "linear" }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          id="setup-panel"
          role="tabpanel"
          aria-labelledby={`setup-tab-${step.key}`}
          className="overflow-hidden rounded-[18px] bg-[#1d1b18] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_30px_80px_-20px_rgb(0_0_0/0.6)]"
        >
          <div className="flex h-11 items-center gap-1.5 border-b border-white/[0.08] px-4">
            <span className="size-2.5 rounded-full bg-[#3f3d3b]" />
            <span className="size-2.5 rounded-full bg-[#3f3d3b]" />
            <span className="size-2.5 rounded-full bg-[#3f3d3b]" />
            <span className="ml-3 font-mono text-[12px] text-white/45">{step.file}</span>
          </div>
          <div className="relative h-[420px] sm:h-[440px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.key}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {step.panel}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const PAGES = ["Getting started", "Billing FAQ", "Integrations guide", "API reference", "Changelog"];
const FILES = ["pricing.pdf", "onboarding.docx", "refund-policy.md"];
// Pages it can take people to, and which ones need a login.
const ROUTES = [
  { path: "/billing", text: "Invoices, plan and card", login: true },
  { path: "/settings/integrations", text: "Connect Stripe, Slack and more", login: true },
  { path: "/pricing", text: "Plans and what's in them", login: false },
];

function TeachPanel() {
  const { ref, time } = useScene<HTMLDivElement>(9, 7);
  const progress = Math.min(1, Math.max(0, (time - 0.3) / 3));
  const shown = Math.min(PAGES.length, Math.floor(progress * PAGES.length + 0.15));
  const ready = progress >= 1;

  return (
    <div ref={ref} className="flex h-full flex-col gap-3 p-5 sm:p-7">
      <div className="rounded-[14px] bg-white/[0.04] p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
        <div className="flex items-center gap-2.5 px-1">
          <Globe className={cn("size-4", ICON)} />
          <span className="flex-1 font-mono text-[12.5px] text-white/85">acme.com/docs</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {ready ? (
              <motion.span
                key="ready"
                className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11.5px] font-medium text-emerald-300"
                initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              >
                <Check className="size-3" /> 48 pages
              </motion.span>
            ) : (
              <motion.span key="count" className="font-mono text-[11.5px] text-white/45 tabular" exit={{ opacity: 0 }}>
                {Math.round(progress * 100)}%
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mx-1 mt-3 h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-col">
          <AnimatePresence initial={false}>
            {PAGES.slice(0, shown).map((page) => (
              <motion.div
                key={page}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[13px] text-white/80"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <FileText className={cn("size-3.5", ICON)} />
                <span className="flex-1">{page}</span>
                <Check className="size-3.5 text-emerald-300" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILES.map((file, index) => (
          <motion.span
            key={file}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-1.5 pr-3 pl-2.5 font-mono text-[12px] text-white/80 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]"
            initial={false}
            animate={{ opacity: time >= 3.6 + index * 0.35 ? 1 : 0, y: time >= 3.6 + index * 0.35 ? 0 : 6 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <Paperclip className={cn("size-3.5", ICON)} />
            {file}
          </motion.span>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {ROUTES.map((route, index) => {
          const shown = time >= 4.7 + index * 0.35;
          return (
            <motion.div
              key={route.path}
              className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[13px]"
              initial={false}
              animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 6 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <CornerDownRight className={cn("size-3.5 shrink-0", ICON_FAINT)} />
              <span className="shrink-0 font-mono text-[12px] text-white/85">{route.path}</span>
              <span className="min-w-0 flex-1 truncate text-white/45">{route.text}</span>
              {route.login && <Lock className={cn("size-3.5 shrink-0", ICON_FAINT)} aria-label="Needs a login" />}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const ACTIONS = [
  { label: "Stripe", detail: "Billing for signed-in users", at: 0.6 },
  { label: "Your API", detail: "POST /campaigns/pause", at: 1.3 },
  { label: "In your app", detail: "create_campaign()", at: 2 },
];

const HANDS_CODE = `// Run things in your app, as the signed-in user
${G}("registerAction", "create_campaign", async ({ name }) => {
  const campaign = await api.campaigns.create({ name });
  return \`Created \${campaign.name}\`;
});

// Single-page apps: move without a reload
${G}("setNavigator", (path) => router.push(path));`;

function HandsPanel() {
  const { ref, time } = useScene<HTMLDivElement>(8, 6);
  return (
    <div ref={ref} className="flex h-full flex-col">
      <div className="grid grid-cols-1 gap-1.5 p-5 pb-0 sm:grid-cols-3 sm:p-7 sm:pb-0">
        {ACTIONS.map((action) => {
          const on = time >= action.at;
          return (
            <div
              key={action.label}
              className="flex items-center gap-3 rounded-[12px] bg-white/[0.04] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]"
            >
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[13px] font-semibold">{action.label}</p>
                <p className="truncate font-mono text-[10.5px] text-white/45">{action.detail}</p>
              </div>
              <span
                className={cn(
                  "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-200",
                  on ? "bg-accent" : "bg-white/15",
                )}
              >
                <span
                  className={cn(
                    "block size-3.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-200 ease-out",
                    on ? "translate-x-[14px]" : "translate-x-[2px]",
                  )}
                />
              </span>
            </div>
          );
        })}
      </div>
      <Code code={HANDS_CODE} className="mt-2" />
    </div>
  );
}

function InstallPanel({ scriptUrl }: { scriptUrl: string }) {
  const code = `<script
  src="${scriptUrl}"
  data-agent-id="your-assistant-id"
  async
></script>

<script>
  // Optional: the signed-in user, signed on your server
  ${G}("identify", { token });
</script>`;

  return (
    <div className="relative h-full">
      <Code code={code} />
      <motion.div
        className="absolute right-5 bottom-5 flex items-center gap-2 rounded-full bg-[#09090b] py-1.5 pr-4 pl-1.5 text-[13px] font-semibold text-white shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_16px_32px_-8px_rgb(0_0_0/0.6)]"
        initial={{ opacity: 0, y: 12, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0, delay: 1.1 }}
      >
        <span className="orb-fill flex size-7 items-center justify-center rounded-full text-white">
          <WaveIcon className="size-3.5" />
        </span>
        Ask anything
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TOKEN =
  /(\/\/.*$)|("[^"]*"|`[^`]*`)|\b(const|await|new|async|return)\b|(<\/?script>?|^>)|\b(src|data-agent-id)(?==)|\b([A-Za-z_]\w*)(?=\()/g;
const TOKEN_CLASSES = ["text-white/40", "text-[#c4b5fd]", "text-[#7dd3fc]", "text-[#f9a8d4]", "text-[#fcd34d]", "text-white"];

// A tiny highlighter: enough for these snippets, nothing more.
function highlight(line: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const group = match.slice(1).findIndex(Boolean);
    parts.push(
      <span key={match.index} className={TOKEN_CLASSES[group]}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}

function Code({ code, className }: { code: string; className?: string }) {
  return (
    <pre className={cn("py-5 pr-5 pl-2 font-mono text-[12px] leading-[1.75] whitespace-pre-wrap sm:text-[13px]", className)}>
      {code.split("\n").map((line, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: index * 0.04 }}
          className="flex min-h-[1.75em] text-white/75"
        >
          <span className="w-8 shrink-0 text-right text-white/25 select-none">{index + 1}</span>
          <span className="min-w-0 flex-1 pl-5">{highlight(line)}</span>
        </motion.div>
      ))}
    </pre>
  );
}
