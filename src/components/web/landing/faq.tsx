"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { LANDING_QUESTIONS, type Question } from "./faq-questions";
import { EASE_OUT, Reveal } from "./motion";

export type { Question };

export function Faq({
  title = "Common questions",
  questions = LANDING_QUESTIONS,
}: {
  title?: string;
  questions?: Question[];
}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-16 px-3 py-24 sm:px-5 sm:py-32">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-20">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="headline text-[40px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[52px]">
            {title}
          </h2>
        </Reveal>

        <Reveal
          delay={0.1}
          amount={0.05}
          className="border-t border-line-strong"
        >
          {questions.map((item, index) => {
            const expanded = open === index;
            return (
              <div key={item.q} className="border-b border-line-strong">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : index)}
                  aria-expanded={expanded}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                >
                  <span className="headline text-[20px] leading-snug font-semibold tracking-[-0.025em] sm:text-[23px]">
                    {item.q}
                  </span>
                  {/* A plus that folds into a minus */}
                  <span
                    className="relative size-4 shrink-0 text-ink-2 transition-colors group-hover:text-ink"
                    aria-hidden
                  >
                    <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 rounded-full bg-current" />
                    <span
                      className={cn(
                        "absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 rounded-full bg-current transition-transform duration-300 ease-out",
                        expanded && "rotate-90",
                      )}
                    />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[680px] pr-10 pb-7 text-[16.5px] leading-relaxed text-pretty text-muted">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
