import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";
import { IntegrationLogo } from "@/components/brand/integration-logos";
import { StripeLogo } from "@/components/brand/stripe-logo";
import { LogoMark } from "@/components/dashboard/logo";
import { Button } from "@/components/ui/button";
import { Backdrop } from "@/components/web/landing/backdrop";
import { Faq } from "@/components/web/landing/faq";
import { FinalCta } from "@/components/web/landing/final-cta";
import { REPO_URL } from "@/components/web/landing/repo";
import { cn } from "@/lib/utils";
import { LISTINGS, type Listing } from "./listings";

// An integration's page, laid out like an app in the Stripe App Marketplace
// (name and install button on top, the story on the left, the facts in a
// panel on the right), in the site's paper and ink. Connecting starts with
// signing in; the rest happens on the assistant's Integrations page.

export const SIGN_IN = "/auth";

export function ListingLogo({ listing, className }: { listing: Listing; className?: string }) {
  return listing.logo === "stripe" ? (
    <StripeLogo className={className} />
  ) : (
    <IntegrationLogo brand={listing.logo} className={className} />
  );
}

// The two products side by side on the listing's colour.
function Banner({ listing }: { listing: Listing }) {
  return (
    <div
      aria-hidden
      className="relative isolate mt-10 flex h-[220px] items-center justify-center overflow-hidden rounded-[22px] bg-[#ebe6dc] sm:h-[300px] sm:rounded-[30px]"
    >
      <Backdrop palette={listing.palette} speed={0.25} className="-z-10" />
      <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06),inset_0_1px_0_rgb(255_255_255/0.25)]" />
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="flex size-20 items-center justify-center rounded-[22px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_18px_36px_-14px_rgb(60_45_20/0.35)] sm:size-24 sm:rounded-[26px]">
          <LogoMark className="size-12 sm:size-14" />
        </span>
        <span className="flex items-center gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-1.5 rounded-full bg-white/80 shadow-[0_1px_2px_rgb(0_0_0/0.15)] sm:size-2" />
          ))}
        </span>
        <span className="rounded-[22px] bg-white p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_18px_36px_-14px_rgb(60_45_20/0.35)] sm:rounded-[26px] sm:p-3.5">
          <ListingLogo listing={listing} className="size-14 rounded-[14px] sm:size-[68px] sm:rounded-[16px] [&_svg]:size-7 sm:[&_svg]:size-8" />
        </span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10 first:border-t-0 first:pt-0">
      <h2 className="headline text-[26px] leading-tight font-semibold tracking-[-0.03em] sm:text-[30px]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Details({ listing }: { listing: Listing }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Works with", value: listing.name },
    { label: listing.categories.length > 1 ? "Categories" : "Category", value: listing.categories.join(", ") },
    { label: "Available on", value: listing.availability },
    { label: "Connects with", value: listing.connection },
    { label: "Built by", value: `${BRAND.name}, ${LEGAL.company}` },
    {
      label: "Support",
      value: (
        <a href={`mailto:${LEGAL.email}`} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          {LEGAL.email}
        </a>
      ),
    },
  ];
  const links = [
    { href: "/pricing", label: "Pricing" },
    { href: "/privacy", label: "Privacy policy" },
    { href: "/terms", label: "Terms" },
    ...(REPO_URL ? [{ href: REPO_URL, label: "Source code" }] : []),
  ];

  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="rounded-[22px] bg-surface p-6 shadow-border">
        <dl className="flex flex-col gap-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[13px] text-muted">{row.label}</dt>
              <dd className="mt-0.5 text-[15px] leading-snug text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-5 text-[14px]">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
                className="text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function ListingCard({ listing, className }: { listing: Listing; className?: string }) {
  return (
    <Link
      href={`/integrations/${listing.slug}`}
      className={cn(
        "group flex flex-col rounded-[22px] bg-surface p-6 shadow-border transition-[box-shadow,scale] duration-150 ease-out hover:shadow-border-hover active:scale-[0.99]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <ListingLogo listing={listing} />
        <span className="flex flex-wrap justify-end gap-1.5">
          {listing.categories.map((category) => (
            <span key={category} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2">
              {category}
            </span>
          ))}
        </span>
      </div>
      <h3 className="headline mt-6 text-[22px] leading-tight font-semibold tracking-[-0.025em]">{listing.name}</h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-pretty text-muted">{listing.tagline}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] font-medium text-ink">
        See how it works
        <ArrowRight className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function ListingPage({ listing }: { listing: Listing }) {
  const others = LISTINGS.filter((other) => other.slug !== listing.slug).slice(0, 3);
  const scopes = listing.logo !== "stripe";

  return (
    <>
      <article className="px-3 pt-8 sm:px-5 sm:pt-12 lg:pt-14">
        <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
          <Link href="/integrations" className="transition-colors hover:text-ink">
            Integrations
          </Link>
          <span className="mx-2 text-faint">/</span>
          <span className="text-ink-2">{listing.name}</span>
        </nav>

        <header className="mt-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-5">
            <ListingLogo listing={listing} className="mt-1 size-16 rounded-[18px] sm:mt-1.5 [&_svg]:size-8" />
            <div>
              <h1 className="headline text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[60px]">{listing.name}</h1>
              <p className="mt-2.5 max-w-[560px] text-[17px] leading-relaxed text-pretty text-muted">{listing.tagline}</p>
            </div>
          </div>
          <Button asChild size="lg" variant="dark" className="h-12 shrink-0 self-start rounded-full px-6 text-[15px] md:self-center">
            <Link href={SIGN_IN}>
              Connect {listing.name} <ArrowRight />
            </Link>
          </Button>
        </header>

        <Banner listing={listing} />

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
          <div className="min-w-0">
            <Section title="Overview">
              <div className="max-w-[720px] text-[17px] leading-relaxed text-pretty text-ink-2 [&_p+p]:mt-4">
                {listing.overview.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </Section>

            <Section title="What the assistant can do">
              <div className={cn("grid grid-cols-1 gap-3 sm:gap-4", !listing.features.some((feature) => feature.image) && "md:grid-cols-2")}>
                {listing.features.map((feature) => (
                  <div key={feature.title} className="flex flex-col rounded-[22px] bg-surface p-2 shadow-border">
                    {feature.image && (
                      <Image
                        src={feature.image.src}
                        alt={feature.image.alt}
                        width={1600}
                        height={800}
                        sizes="(min-width: 1024px) 760px, 100vw"
                        className="h-auto w-full rounded-[16px] outline outline-1 -outline-offset-1 outline-black/10"
                      />
                    )}
                    <div className="px-4 pt-4 pb-5">
                      <h3 className="headline text-[21px] leading-tight font-semibold tracking-[-0.025em]">{feature.title}</h3>
                      <p className="mt-2 max-w-[600px] text-[15.5px] leading-relaxed text-pretty text-muted">{feature.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="How to connect it">
              <ul className="flex max-w-[720px] flex-col gap-3.5">
                {listing.connect.map((step) => (
                  <li key={step} className="flex gap-3 text-[16.5px] leading-relaxed text-pretty text-ink-2">
                    <Check className="mt-1 size-4 shrink-0 text-accent" strokeWidth={2.5} />
                    {step}
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" variant="dark" className="mt-8 h-12 rounded-full px-6 text-[15px]">
                <Link href={SIGN_IN}>
                  Sign in to connect {listing.name} <ArrowRight />
                </Link>
              </Button>
            </Section>

            <Section title={`What ${BRAND.name} can access`}>
              <p className="max-w-[720px] text-[16.5px] leading-relaxed text-pretty text-ink-2">
                {scopes
                  ? `${BRAND.name} asks ${listing.name} for these scopes, and nothing else:`
                  : `The ${BRAND.name} app asks ${listing.name} for these permissions, and nothing else:`}
              </p>
              <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-border">
                {listing.access.map((item) => (
                  <li key={item.name} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
                    <span
                      className={cn(
                        "shrink-0 text-ink sm:w-[260px]",
                        scopes ? "font-mono text-[13.5px] leading-6" : "text-[15px] leading-6 font-medium",
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="text-[15px] leading-6 text-pretty text-muted">{item.why}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Details listing={listing} />
        </div>
      </article>

      <Faq title={`Questions about ${BRAND.name} and ${listing.name}`} questions={listing.questions} />

      <section className="px-3 pb-24 sm:px-5 sm:pb-32">
        <div className="flex items-end justify-between gap-6">
          <h2 className="headline text-[32px] leading-tight font-semibold tracking-[-0.035em] sm:text-[40px]">More integrations</h2>
          <Link href="/integrations" className="mb-1.5 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
            See all <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          {others.map((other) => (
            <ListingCard key={other.slug} listing={other} />
          ))}
        </div>
      </section>

      <FinalCta />
    </>
  );
}
