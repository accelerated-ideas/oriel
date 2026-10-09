"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/config/brand";
import { Button } from "@/components/ui/button";

type EmbedGlobal = ((...args: unknown[]) => void) & { q?: unknown[][] };

// With a live demo assistant on the page (NEXT_PUBLIC_DEMO_AGENT_ID), this
// starts a real call with it. Otherwise it goes to the setup section.
export function TalkButton() {
  const agentId = process.env.NEXT_PUBLIC_DEMO_AGENT_ID;
  if (!agentId) {
    return (
      <Button asChild size="lg" variant="outline" className="h-12 rounded-full pr-5 pl-6 text-[15px]">
        <Link href="#how-it-works">
          See how it works <ArrowRight />
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      className="h-12 rounded-full pr-6 pl-2 text-[15px]"
      onClick={() => {
        const win = window as unknown as Record<string, EmbedGlobal | undefined>;
        const embed = win[BRAND.embedGlobal];
        if (embed) return embed("open", { mode: "voice" });
        // Still loading. The script replays queued calls before it reads its own
        // data-agent-id, so the queue has to start the assistant itself.
        const queue: unknown[][] = [["init", { agentId }], ["open", { mode: "voice" }]];
        win[BRAND.embedGlobal] = Object.assign((...args: unknown[]) => void queue.push(args), { q: queue });
      }}
    >
      <span className="orb-fill size-8 rounded-full shadow-[inset_0_-2px_4px_rgb(0_0_0/0.2)]" />
      Talk to it now
    </Button>
  );
}
