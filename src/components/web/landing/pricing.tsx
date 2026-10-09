"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { BRAND } from "@/config/brand";
import { GitHubMark } from "@/components/brand/github-mark";
import { publicPlans, subscriptionPlans, TRIAL_PLAN_ID, type BillingPeriod } from "@/config/plans";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EASE_OUT, Reveal } from "./motion";

const trial = subscriptionPlans.find((plan) => plan.id === TRIAL_PLAN_ID);

export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  return (
    <section className="px-3 pt-10 pb-24 sm:px-5 sm:pt-16 sm:pb-32 lg:pt-20">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <h1 className="headline max-w-[760px] text-[48px] leading-[0.95] font-semibold tracking-[-0.045em] text-balance sm:text-[76px]">
            Pricing that grows with your traffic
          </h1>
          <p className="mt-6 max-w-[520px] text-[18px] leading-relaxed text-pretty text-ink-2">
            Pay for the messages your visitors send. Replies are free, and so is running it yourself.
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <div className="inline-flex rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Billing period">
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={period === value}
                onClick={() => setPeriod(value)}
                className={cn(
                  "relative rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-150",
                  period === value ? "text-white" : "text-ink-2 hover:text-ink",
                )}
              >
                {period === value && (
                  <motion.span
                    layoutId="billing-period"
                    className="absolute inset-0 rounded-full bg-ink"
                    transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                  />
                )}
                <span className="relative">{value === "monthly" ? "Monthly" : "Yearly, 2 months free"}</span>
              </button>
            ))}
          </div>
        </Reveal>
      </div>

      <Reveal className="mt-12" delay={0.1} amount={0.02}>
        <div className="overflow-hidden rounded-[22px] bg-surface shadow-border sm:rounded-[30px]">
          <div className="grid grid-cols-1 lg:grid-cols-3">
            {publicPlans.map((plan, index) => {
              const featured = plan.style.is_recommended;
              const price = period === "monthly" ? plan.price_config.price : plan.price_config.annual_price;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col p-7 sm:p-9",
                    featured ? "bg-accent text-white" : index > 0 && "border-t border-line lg:border-t-0 lg:border-l",
                  )}
                >
                  <h3 className="headline text-[24px] font-semibold tracking-[-0.03em]">{plan.name}</h3>
                  <p className={cn("mt-2 text-[15px] text-pretty", featured ? "text-white/75" : "text-muted")}>{plan.description}</p>

                  <div className="mt-10 flex items-baseline gap-1.5">
                    <motion.span
                      key={`${plan.id}-${period}`}
                      className="headline text-[64px] leading-none font-semibold tracking-[-0.045em] tabular sm:text-[76px]"
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                    >
                      ${price}
                    </motion.span>
                    <span className={cn("text-[15px]", featured ? "text-white/70" : "text-muted")}>/month</span>
                  </div>
                  <p className={cn("mt-2 h-5 text-[13.5px]", featured ? "text-white/65" : "text-muted")}>
                    {period === "annual" ? `$${plan.price_config.annual_total.toLocaleString("en-US")} billed yearly` : ""}
                  </p>

                  <Button
                    asChild
                    size="lg"
                    variant={featured ? "outline" : "dark"}
                    className={cn("mt-8 h-12 w-full rounded-full text-[15px]", featured && "shadow-none")}
                  >
                    <Link href="/auth">Start free trial</Link>
                  </Button>

                  <ul className="mt-9 flex flex-col gap-3.5">
                    {plan.style.feature_list.map((feature) => (
                      <li
                        key={feature.label}
                        className={cn("flex items-start gap-3 text-[15px]", featured ? "text-white/90" : "text-ink-2")}
                        title={feature.tooltip ?? undefined}
                      >
                        <Check className={cn("mt-0.5 size-4 shrink-0", featured ? "text-white" : "text-accent")} strokeWidth={2.5} />
                        {feature.label}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-5 border-t border-line p-7 sm:p-9 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="headline text-[24px] font-semibold tracking-[-0.03em]">
                Self-hosted <span className="font-normal text-muted">· Free</span>
              </h3>
              <p className="mt-2 max-w-[640px] text-[15px] text-pretty text-muted">
                {BRAND.name} is open source. Run it on your own servers with your own API keys, with every feature and no
                message limits.
              </p>
            </div>
            {BRAND.repoUrl ? (
              <Button asChild size="lg" variant="outline" className="h-12 shrink-0 rounded-full px-6">
                <a href={BRAND.repoUrl}>
                  <GitHubMark className="size-[18px]" />
                  View the source
                </a>
              </Button>
            ) : (
              <span className="flex shrink-0 items-center gap-2 self-start rounded-full bg-surface-2 px-4 py-2 text-[14px] font-medium text-ink-2 md:self-center">
                <GitHubMark className="size-4" />
                Source code coming soon
              </span>
            )}
          </div>
        </div>
      </Reveal>

      {trial && (
        <Reveal className="mt-6 text-[15px] text-muted">
          Hosted plans start with a {trial.includes.trial_days}-day trial and {trial.includes.messages_per_month} messages, no card
          needed.
        </Reveal>
      )}
    </section>
  );
}
