import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { publicPlans, type SubscriptionPlan } from "@/config/plans";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

// Every limit and feature side by side, read from the plans themselves so the
// table can't drift from what's enforced.
type Value = string | boolean;
type Row = { label: string; value: (plan: SubscriptionPlan) => Value };

const count = (value: number) => value.toLocaleString("en-US");
const pages = (characters: number) => `About ${count(Math.round(characters / 2_500))} pages`;
const refresh = (hours: number) => (hours >= 24 * 7 ? "Weekly" : hours >= 24 ? "Daily" : "Hourly");
const autoRefresh = (days: number | null) => (days === null ? false : days === 1 ? "Daily" : days === 7 ? "Weekly" : `Every ${days} days`);

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Usage",
    rows: [
      { label: "Messages a month", value: (plan) => count(plan.includes.messages_per_month) },
      { label: "Assistants", value: (plan) => count(plan.includes.assistants) },
      { label: "Team members", value: (plan) => count(plan.includes.seats) },
    ],
  },
  {
    title: "Knowledge",
    rows: [
      { label: "Knowledge from your site, docs and files", value: (plan) => pages(plan.includes.knowledge_characters) },
      { label: "Re-read a page", value: (plan) => refresh(plan.includes.refresh_every_hours) },
      { label: "Your site re-read for you", value: (plan) => autoRefresh(plan.includes.auto_refresh_days) },
      { label: "Site map pages per assistant", value: (plan) => count(plan.includes.site_map_pages) },
    ],
  },
  {
    title: "What it can do",
    rows: [
      { label: "Voice calls and text chat", value: (plan) => plan.includes.voice_calls },
      { label: "Takes people to pages and points at things", value: () => true },
      { label: "Insights and follow-ups for your team", value: () => true },
      { label: "Actions with your API and in your app", value: (plan) => plan.includes.custom_actions },
      { label: "Stripe billing for signed-in users", value: (plan) => plan.includes.stripe_integration },
      { label: "Verified signed-in users", value: (plan) => plan.includes.identity_verification },
    ],
  },
  {
    title: "Support",
    rows: [{ label: "Priority support", value: (plan) => plan.includes.priority_support }],
  },
];

// Labels get more of the width on phones, where they'd otherwise wrap a lot.
const COLUMNS = "grid-cols-[minmax(0,2.1fr)_repeat(var(--plans),minmax(0,1fr))] sm:grid-cols-[minmax(0,1.6fr)_repeat(var(--plans),minmax(0,1fr))]";

export function PlanComparison() {
  return (
    <section className="px-3 pb-24 sm:px-5 sm:pb-32">
      <Reveal>
        <h2 className="headline text-[36px] leading-[0.98] font-semibold tracking-[-0.04em] sm:text-[48px]">Compare plans</h2>
      </Reveal>

      <Reveal className="mt-10" amount={0.05}>
        {/* Clipped, not hidden, so the plan names can stick under the nav. */}
        <div
          className="overflow-clip rounded-[22px] bg-surface shadow-border sm:rounded-[30px]"
          style={{ ["--plans" as string]: publicPlans.length }}
        >
          <div
            className={cn("sticky top-[72px] z-10 grid border-b border-line bg-surface", COLUMNS)}
          >
            <span />
            {publicPlans.map((plan) => (
              <span
                key={plan.id}
                className={cn(
                  "headline px-1 py-4 text-center text-[14px] font-semibold tracking-[-0.02em] sm:px-2 sm:py-5 sm:text-[20px]",
                  plan.style.is_recommended && "text-accent-ink",
                )}
              >
                {plan.name}
              </span>
            ))}
          </div>

          {GROUPS.map((group) => (
            <Fragment key={group.title}>
              <p className="border-b border-line bg-canvas/60 px-4 py-2.5 text-[13.5px] font-semibold text-ink sm:px-7">{group.title}</p>
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className={cn("grid items-center border-b border-line last:border-b-0", COLUMNS)}
                >
                  <span className="px-4 py-3.5 text-[13.5px] leading-snug text-ink-2 sm:px-7 sm:text-[15px]">{row.label}</span>
                  {publicPlans.map((plan) => (
                    <span
                      key={plan.id}
                      className={cn(
                        "flex h-full items-center justify-center px-1 py-3.5 text-center text-[12px] leading-tight text-ink tabular sm:px-1.5 sm:text-[14.5px]",
                        plan.style.is_recommended && "bg-accent-soft/35",
                      )}
                    >
                      <Cell value={row.value(plan)} />
                    </span>
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Cell({ value }: { value: Value }) {
  if (value === true) return <Check className="size-[18px] text-accent" strokeWidth={2.5} aria-label="Included" />;
  if (value === false) return <Minus className="size-4 text-faint" aria-label="Not included" />;
  return <>{value}</>;
}
