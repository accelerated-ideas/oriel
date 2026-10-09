"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { actionUpdateAgent } from "@/server-actions/agents";
import { runAction } from "@/lib/run-action";
import { Switch } from "@/components/ui/switch";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import type { AvatarStyle } from "@/config/avatars";

export function AgentTopBar({
  orgId,
  agentId,
  name,
  isLive,
  accentColor,
  avatarStyle,
}: {
  orgId: string;
  agentId: string;
  name: string;
  isLive: boolean;
  accentColor: string;
  avatarStyle: AvatarStyle;
}) {
  const router = useRouter();
  const [live, setLive] = useState(isLive);

  useEffect(() => setLive(isLive), [isLive]);

  async function toggleLive(value: boolean) {
    setLive(value);
    const result = await runAction(() => actionUpdateAgent(agentId, { is_live: value }), {
      success: value ? "Live on your site" : "Turned off",
    });
    if (!result) setLive(!value);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          href={`/account/${orgId}/agents`}
          aria-label="All assistants"
          title="All assistants"
          className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-[10px] text-ink-2 shadow-border transition-[background-color,color,scale] duration-150 ease-out hover:bg-surface-2 hover:text-ink active:scale-[0.96]"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <AgentAvatar color={accentColor} look={avatarStyle} className="size-[22px]" />
        <p className="truncate text-[14.5px] font-semibold">{name}</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-ink-2">
        <Switch checked={live} onCheckedChange={toggleLive} aria-label="Live on site" />
        {live ? "Live" : "Off"}
      </label>
    </div>
  );
}
