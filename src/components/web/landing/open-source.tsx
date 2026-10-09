"use client";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { BRAND } from "@/config/brand";
import { GitHubMark } from "@/components/brand/github-mark";
import { Button } from "@/components/ui/button";
import { Backdrop } from "./backdrop";
import { Reveal, usePrefersReducedMotion } from "./motion";
import { REPO_URL } from "./repo";

const POINTS = [
  "Every feature, with no plans or message limits",
  "Your own Gemini and ElevenLabs keys, and your own database",
  "AGPL-3.0",
];

// The local setup from the README, typed out when it scrolls into view.
const LINES: { command: string; note?: string }[] = [
  ...(REPO_URL ? [{ command: `git clone ${REPO_URL}` }] : []),
  { command: "npm install" },
  { command: "supabase start" },
  { command: "cp .env.example .env.local", note: "# add your keys" },
  { command: "npm run dev" },
];
const TYPE_SECONDS_PER_CHAR = 0.028;
const PAUSE_BETWEEN = 0.35;

export function OpenSource() {
  return (
    <section
      id="open-source"
      className="relative isolate scroll-mt-16 overflow-hidden rounded-[22px] px-5 py-20 text-white sm:rounded-[30px] sm:px-10 sm:py-28 lg:px-16"
    >
      <Backdrop palette="night" dark speed={0.2} className="-z-10" />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
        <div>
          <Reveal>
            <h2 className="headline max-w-[560px] text-[40px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[60px]">
              Open source, all of it
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="mt-6 max-w-[500px] text-[17.5px] leading-relaxed text-pretty text-white/70">
              Run {BRAND.name} on your own servers, or let us host it for you.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="mt-8 flex max-w-[500px] flex-col gap-3">
              {POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-[15.5px] text-white/85"
                >
                  <Check
                    className="mt-1 size-4 shrink-0 text-[#c4b5fd]"
                    strokeWidth={2.5}
                  />
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.15} className="mt-10">
            {REPO_URL ? (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full px-6 text-[15px] shadow-none"
              >
                <a href={REPO_URL}>
                  <GitHubMark className="size-[18px]" />
                  View on GitHub
                  <ArrowRight />
                </a>
              </Button>
            ) : (
              <span className="inline-flex h-12 items-center gap-2.5 rounded-full bg-white/[0.08] px-6 text-[15px] font-medium text-white/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] backdrop-blur-md">
                <GitHubMark className="size-[18px]" />
                Source code coming soon
              </span>
            )}
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <Terminal />
        </Reveal>
      </div>
    </section>
  );
}

function Terminal() {
  const reduce = usePrefersReducedMotion();
  // When each line starts typing, one after another.
  let at = 0.3;
  const starts = LINES.map((line) => {
    const start = at;
    at += line.command.length * TYPE_SECONDS_PER_CHAR + PAUSE_BETWEEN;
    return start;
  });

  return (
    <div className="overflow-hidden rounded-[18px] bg-[#0b0a10]/75 shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_30px_80px_-24px_rgb(0_0_0/0.7)] backdrop-blur-xl">
      <div className="flex h-11 items-center gap-1.5 border-b border-white/[0.08] px-4">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <motion.div
        className="flex flex-col gap-2 px-5 py-6 font-mono text-[13px] leading-relaxed sm:px-6 sm:text-[14px]"
        initial={reduce ? false : "hidden"}
        whileInView="shown"
        viewport={{ once: true, amount: 0.5 }}
      >
        {LINES.map((line, index) => (
          <div key={line.command} className="flex min-w-0 gap-3">
            <span className="shrink-0 text-[#c4b5fd]">$</span>
            {/* Revealed left to right, like it's being typed */}
            <motion.span
              className="min-w-0 truncate text-white/90"
              variants={{
                hidden: { clipPath: "inset(0 100% 0 0)" },
                shown: {
                  clipPath: "inset(0 0% 0 0)",
                  transition: {
                    duration: line.command.length * TYPE_SECONDS_PER_CHAR,
                    ease: "linear",
                    delay: starts[index],
                  },
                },
              }}
            >
              {line.command}
              {line.note && (
                <span className="text-white/35">{`  ${line.note}`}</span>
              )}
            </motion.span>
          </div>
        ))}
        <motion.div
          className="mt-2 flex flex-col gap-1 border-t border-white/[0.08] pt-4 text-white/55"
          variants={{
            hidden: { opacity: 0, y: 4 },
            shown: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.4, delay: at },
            },
          }}
        >
          <span>
            <span className="text-emerald-300">✓</span> Ready on{" "}
            <span className="text-white/85">http://localhost:3010</span>
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}
