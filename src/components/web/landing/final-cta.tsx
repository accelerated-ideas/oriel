"use client";
import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { ArrowRight } from "lucide-react";
import { subscriptionPlans, TRIAL_PLAN_ID } from "@/config/plans";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "./motion";

const WORDS = "Stop answering the same question twice.".split(" ");
const TRIAL_DAYS = subscriptionPlans.find((plan) => plan.id === TRIAL_PLAN_ID)?.includes.trial_days ?? 14;

export function FinalCta() {
  const ref = useRef<HTMLHeadingElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = usePrefersReducedMotion();

  return (
    <section className="overflow-hidden rounded-[22px] bg-accent px-6 pt-20 pb-8 text-white sm:rounded-[30px] sm:px-12 sm:pt-28 sm:pb-12 lg:px-16">
      {/* The headline is "spoken" word by word, like the captions at the top of the page. */}
      <h2
        ref={ref}
        className="headline max-w-[1150px] text-[clamp(48px,8.6vw,132px)] leading-[0.9] font-semibold tracking-[-0.045em] text-balance"
      >
        {WORDS.map((word, index) => (
          <motion.span
            key={index}
            initial={false}
            animate={{ opacity: seen || reduce ? 1 : 0.3 }}
            transition={{ duration: 0.2, delay: seen && !reduce ? 0.15 + index * 0.13 : 0 }}
          >
            {word}{" "}
          </motion.span>
        ))}
      </h2>

      <div className="mt-14 flex flex-col gap-8 border-t border-white/25 pt-8 sm:mt-20 md:flex-row md:items-center md:justify-between">
        <p className="max-w-[460px] text-[18px] leading-relaxed text-pretty text-white/85">
          Let it take the next one. Teach it your docs, add one script tag, and try it free for {TRIAL_DAYS} days, no card
          needed.
        </p>
        <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-[15px] shadow-none">
          <Link href="/auth">
            Create your assistant <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
