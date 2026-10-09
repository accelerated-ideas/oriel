"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { ANALYTICS_ENABLED } from "@/config/analytics";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "../landing/motion";
import { closeSettings, hasStoredChoice, openSettings, setChoice } from "./consent-store";
import { useConsent } from "./use-consent";

// Both answers look the same and sit side by side, so saying no is as easy as
// saying yes. Nothing optional runs until one is picked.
const ANSWER =
  "h-10 rounded-full bg-ink px-4 text-[14.5px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] transition-[background-color,scale] duration-150 ease-out hover:bg-zinc-800 active:scale-[0.97]";

export function ConsentBanner() {
  const { choice, settingsOpen } = useConsent();
  const show = ANALYTICS_ENABLED && (choice === "unset" || settingsOpen);
  const ref = useRef<HTMLElement>(null);

  // Opened from "Cookie settings": take focus, and let Escape close it.
  useEffect(() => {
    if (!settingsOpen) return;
    ref.current?.querySelector<HTMLButtonElement>("button[data-answer]")?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeSettings();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const current =
    choice === "granted"
      ? "Right now it's allowed."
      : choice === "denied"
        ? hasStoredChoice()
          ? "Right now it's off."
          : "It's off, because your browser asks sites not to track you."
        : null;

  return (
    <AnimatePresence>
      {show && (
        <motion.section
          ref={ref}
          aria-label="Cookie choice"
          className="fixed inset-x-3 bottom-3 z-50 rounded-[24px] bg-surface p-5 text-ink shadow-float sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[400px]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          {settingsOpen && (
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close"
              className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
          <p className={cn("text-[16px] font-semibold tracking-[-0.01em]", settingsOpen && "pr-8")}>Can we use analytics cookies?</p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-pretty text-ink-2">
            Google Analytics would help us see how people find and use this site. It only runs if you allow it, and you can change
            your mind any time from Cookie settings at the bottom of the page.{" "}
            <Link href="/privacy#storage" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Learn more
            </Link>
          </p>
          {settingsOpen && current && <p className="mt-3 text-[13.5px] text-muted">{current}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" data-answer onClick={() => setChoice("denied")} className={ANSWER}>
              Don&apos;t allow
            </button>
            <button type="button" data-answer onClick={() => setChoice("granted")} className={ANSWER}>
              Allow
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

// For the footer: brings the banner back to change the choice.
export function CookieSettingsButton({ className }: { className?: string }) {
  if (!ANALYTICS_ENABLED) return null;
  return (
    <button type="button" onClick={openSettings} className={className}>
      Cookie settings
    </button>
  );
}
