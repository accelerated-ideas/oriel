"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/config/brand";
import { GitHubMark } from "@/components/brand/github-mark";
import { Button } from "@/components/ui/button";
import { EASE_OUT } from "./motion";
import { HeroFilm } from "./hero-film";
import { REPO_HREF, REPO_LINK_PROPS } from "./repo";

const LINES = ["Talk every user", "through it."];

export function Hero() {
  return (
    <section className="pt-10 sm:pt-16 lg:pt-20">
      {/* On wide screens the intro sits beside the headline, top-aligned with it.
          The headline is sized so its longest line always leaves the gutter clear. */}
      <div className="px-3 sm:px-5 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-x-20">
        <h1 className="headline text-[12vw] leading-[0.9] font-semibold tracking-[-0.045em] sm:text-[10.5vw] xl:text-[min(8.6vw,128px)]">
          {LINES.map((line, index) => (
            // Each line rises out of its own mask.
            <span key={line} className="-mb-[0.16em] block overflow-hidden pb-[0.16em]">
              <motion.span
                className="block"
                initial={{ y: "108%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.95, ease: EASE_OUT, delay: 0.05 + index * 0.09 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          // Lines the first line of text up with the headline's capitals, which sit
          // lower in their line box the bigger the headline gets.
          className="mt-8 sm:mt-10 xl:mt-[calc(min(8.6vw,128px)*0.14-10px)]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.35 }}
        >
          <p className="max-w-[520px] text-[18px] leading-[1.55] text-pretty text-ink-2 sm:text-[19px]">
            {BRAND.name} is a voice assistant that helps users understand and use your product. It answers questions,
            explains how things work, shows them where to go, and can handle tasks along the way. You learn where users get
            stuck and what they need.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="dark" className="h-12 rounded-full px-6 text-[15px]">
              <Link href="/auth">Start free trial</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-5 text-[15px]">
              <a href={REPO_HREF} {...REPO_LINK_PROPS}>
                <GitHubMark className="size-[18px]" />
                Open source
                <ArrowRight />
              </a>
            </Button>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="mt-12 sm:mt-16"
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.45 }}
      >
        <HeroFilm />
      </motion.div>
    </section>
  );
}
