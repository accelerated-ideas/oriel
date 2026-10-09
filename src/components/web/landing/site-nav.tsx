"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { GitHubMark } from "@/components/brand/github-mark";
import { Logo } from "@/components/dashboard/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "./motion";
import { NAV_LINKS } from "./nav-links";
import { REPO_HREF, REPO_LINK_PROPS, REPO_URL } from "./repo";

// A full-width bar at the top of the page that tucks into a floating capsule
// once you scroll, and marks the page you're on, like Pricing.
export function SiteNav() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = NAV_LINKS.find((link) => link.href === pathname)?.href ?? null;

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  // On the landing page its sections scroll into view; anywhere else the link
  // navigates there as usual.
  const go = (event: React.MouseEvent, href: string) => {
    setOpen(false);
    const target = onLanding && href.startsWith("/#") && document.querySelector(href.slice(1));
    if (!target) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", href.slice(1));
  };

  const floating = scrolled || open;

  return (
    <header className="sticky top-0 z-40 h-[72px] px-2 pt-2 sm:px-3">
      <div
        className={cn(
          // Equal outer columns keep the links in the middle, whatever sits either side.
          "mx-auto flex h-14 items-center justify-between gap-4 rounded-full transition-[max-width,padding,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.2,0,0,1)] md:grid md:grid-cols-[1fr_auto_1fr]",
          floating
            ? "max-w-[920px] bg-surface/88 pr-2 pl-4 shadow-[0_0_0_1px_var(--color-line),0_10px_30px_-14px_rgb(28_25_21/0.3)] backdrop-blur-xl sm:pl-5 md:pr-5"
            : "max-w-[1360px] bg-transparent pr-2 pl-4 sm:pr-5 sm:pl-5",
        )}
      >
        <Logo className="justify-self-start" />

        <nav className="hidden items-center md:flex">
          {NAV_LINKS.map((link) => {
            const current = floating && active === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={(event) => go(event, link.href)}
                aria-current={current ? "location" : undefined}
                className="relative rounded-full px-3.5 py-2 text-[15px] text-ink-2 transition-colors duration-150 hover:text-ink"
              >
                {current && (
                  <motion.span
                    layoutId="nav-current"
                    className="absolute inset-0 rounded-full bg-ink/[0.07]"
                    transition={{ type: "spring", duration: 0.45, bounce: 0 }}
                  />
                )}
                <span className={cn("relative", current && "text-ink")}>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* In the capsule the padding is even, for the centring, and the buttons
            reach back into it so the pill sits close to the edge. */}
        <div
          className={cn(
            "flex items-center gap-1.5 justify-self-end transition-[margin] duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
            floating && "md:-mr-3",
          )}
        >
          <a
            href={REPO_HREF}
            onClick={REPO_URL ? undefined : (event) => go(event, REPO_HREF)}
            {...REPO_LINK_PROPS}
            aria-label={REPO_URL ? "Source code on GitHub" : "Open source, code coming soon to GitHub"}
            title={REPO_URL ? "GitHub" : "Source code coming soon"}
            className="hidden size-10 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-ink/[0.06] hover:text-ink md:grid"
          >
            <GitHubMark className="size-[19px]" />
          </a>
          <Link
            href="/auth"
            className="hidden rounded-full px-3.5 py-2 text-[15px] text-ink-2 transition-colors duration-150 hover:text-ink lg:block"
          >
            Sign in
          </Link>
          <Button asChild variant="dark" className="h-10 rounded-full px-[18px] text-[14.5px]">
            <Link href="/auth">Get started</Link>
          </Button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/[0.06] md:hidden"
          >
            <span className="relative block h-3 w-[18px]" aria-hidden>
              {[0, 1].map((line) => (
                <span
                  key={line}
                  className={cn(
                    "absolute top-1/2 left-0 -mt-[0.75px] h-[1.5px] w-full rounded-full bg-current transition-[translate,rotate] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    open ? "translate-y-0" : line === 0 ? "-translate-y-[3.5px]" : "translate-y-[3.5px]",
                    open && (line === 0 ? "rotate-45" : "-rotate-45"),
                  )}
                />
              ))}
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="site-menu"
            key="menu"
            className="mx-auto mt-2 max-w-[920px] origin-top rounded-[26px] bg-surface p-2 shadow-[0_0_0_1px_var(--color-line),0_24px_48px_-20px_rgb(28_25_21/0.35)] md:hidden"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={(event) => go(event, link.href)}
                className="headline block rounded-[18px] px-4 py-3 text-[28px] leading-tight font-semibold tracking-[-0.035em] transition-colors hover:bg-canvas"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-6 border-t border-line px-4 pt-4 pb-3">
              <Link href="/auth" className="text-[16px] text-ink-2 transition-colors hover:text-ink">
                Sign in
              </Link>
              <a
                href={REPO_HREF}
                onClick={REPO_URL ? undefined : (event) => go(event, REPO_HREF)}
                {...REPO_LINK_PROPS}
                className="flex items-center gap-2 text-[16px] text-ink-2 transition-colors hover:text-ink"
              >
                <GitHubMark className="size-[17px]" />
                {REPO_URL ? "GitHub" : "GitHub, coming soon"}
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
