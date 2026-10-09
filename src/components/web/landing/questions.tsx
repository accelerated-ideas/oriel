"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { Reveal, usePrefersReducedMotion } from "./motion";

// Things people ask support every day. The last few only show on wider screens.
const QUESTIONS = [
  "Where do I export my data?",
  "Cancel my subscription",
  "Why is my invoice higher this month?",
  "Take me to billing",
  "How do I invite my team?",
  "The import keeps failing",
  "Can I switch to annual?",
  "Where's my API key?",
  "I can't find the export button",
  "Change the card on file",
  "How do I connect Stripe?",
  "Download last month's receipt",
  "Pause all my campaigns",
  "What's included in Pro?",
  "Set up Slack alerts for me",
  "Why can't I see my invoices?",
];
const MOBILE_COUNT = 11;

// The spotlight hops around instead of reading left to right.
const ORDER = QUESTIONS.map((_, index) => (index * 7) % QUESTIONS.length);

export function Questions() {
  const ref = useRef<HTMLUListElement>(null);
  const visible = useInView(ref, { amount: 0.4 });
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(ORDER[0]);
  const step = useRef(0);

  useEffect(() => {
    if (!visible || reduce) return;
    const timer = setInterval(() => {
      // Skip the questions that are hidden on phones.
      const shown = window.innerWidth < 640 ? MOBILE_COUNT : QUESTIONS.length;
      do step.current += 1;
      while (ORDER[step.current % ORDER.length] >= shown);
      setActive(ORDER[step.current % ORDER.length]);
    }, 1600);
    return () => clearInterval(timer);
  }, [visible, reduce]);

  return (
    <section className="px-3 py-24 sm:px-5 sm:py-32 lg:py-40">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-20">
        <Reveal className="lg:pt-3">
          <h2 className="headline text-[40px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[52px]">
            Your team answers these every day
          </h2>
          <p className="mt-5 max-w-[360px] text-[17px] leading-relaxed text-pretty text-muted">
            Now people get the answer out loud, on the page where they got stuck.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <ul
            ref={ref}
            className="spoken text-[29px] leading-[1.18] tracking-[-0.01em] italic sm:text-[40px] xl:text-[48px]"
          >
            {QUESTIONS.map((question, index) => (
              <li key={question} className={cn("inline", index >= MOBILE_COUNT && "hidden sm:inline")}>
                <span
                  className={cn(
                    "transition-colors duration-500 ease-out",
                    reduce || index === active ? "text-ink" : "text-ink/45",
                  )}
                >
                  “{question}”
                </span>{" "}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
