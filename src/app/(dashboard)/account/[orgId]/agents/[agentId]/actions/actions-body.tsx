"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Globe,
  LifeBuoy,
  Lightbulb,
  MonitorSmartphone,
  MoreHorizontal,
  MousePointerClick,
  Navigation,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { actionDeleteAction, actionUpdateActionFlags } from "@/server-actions/actions";
import { actionUpdateAgent } from "@/server-actions/agents";
import { runAction } from "@/lib/run-action";
import type { BuiltinToolKey } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { ActionEditor } from "./action-editor";
import { ToolRow, WhereBadge, type SafeAction } from "./tool-row";

const BUILTINS: {
  key: BuiltinToolKey;
  tool: string;
  title: string;
  description: string;
  where: "page" | "server";
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "navigate",
    tool: "navigate",
    title: "Open pages",
    description: "Takes people to pages in your site map, or to links other actions return.",
    where: "page",
    icon: Navigation,
  },
  {
    key: "highlight",
    tool: "highlight",
    title: "Point at things",
    description: "Draws a ring around the button or field it's talking about.",
    where: "page",
    icon: MousePointerClick,
  },
  {
    key: "search_knowledge",
    tool: "search_knowledge",
    title: "Search knowledge",
    description: "Looks up answers in your knowledge when they aren't already in front of it.",
    where: "server",
    icon: BookOpen,
  },
  {
    key: "capture_feedback",
    tool: "capture_feedback",
    title: "Log feedback",
    description: "Records bugs, feature requests and frustrations in Insights.",
    where: "server",
    icon: Lightbulb,
  },
  {
    key: "escalate",
    tool: "escalate_to_human",
    title: "Ask your team to follow up",
    description: "Sends your team a complete summary when it can't resolve something, so someone gets back to the visitor.",
    where: "server",
    icon: LifeBuoy,
  },
];

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[24px] leading-tight">{title}</h2>
        {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ActionsBody({
  agentId,
  builtins,
  actions,
  pageCount,
  siteMapHref,
}: {
  agentId: string;
  builtins: Partial<Record<BuiltinToolKey, boolean>>;
  actions: SafeAction[];
  pageCount: number;
  siteMapHref: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SafeAction | "new" | null>(null);
  const custom = actions.filter((action) => action.kind !== "stripe");

  const toggleBuiltin = (key: BuiltinToolKey, value: boolean) =>
    runAction(() => actionUpdateAgent(agentId, { builtin_tools: { [key]: value } }), { onSuccess: () => router.refresh() });

  const setFlags = (action: SafeAction, flags: { enabled?: boolean; requires_confirmation?: boolean }) =>
    runAction(() => actionUpdateActionFlags(agentId, action.id, flags), { onSuccess: () => router.refresh() });

  return (
    <div className="mt-10 flex flex-col gap-12">
      <section>
        <SectionTitle title="Built in" />
        <Card className="mt-4 divide-y divide-line overflow-hidden">
          {BUILTINS.map((item) => {
            const enabled = builtins[item.key] !== false;
            return (
              <ToolRow
                key={item.key}
                icon={item.icon}
                title={item.title}
                tool={item.tool}
                description={
                  item.key === "navigate"
                    ? `${item.description} ${pageCount === 0 ? "Your site map is empty." : `${pageCount} pages mapped.`}`
                    : item.description
                }
                badges={
                  <>
                    <WhereBadge where={item.where} />
                    {item.key === "navigate" && (
                      <Link href={siteMapHref} className="text-[12.5px] font-medium underline-offset-2 hover:underline">
                        Edit site map
                      </Link>
                    )}
                  </>
                }
                muted={!enabled}
                control={<Switch checked={enabled} onCheckedChange={(value) => toggleBuiltin(item.key, value)} aria-label={item.title} />}
              />
            );
          })}
        </Card>
      </section>

      <section>
        <SectionTitle
          title="Custom actions"
          description="Call your API, or run code you register on your page, with parameters the model fills in."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> New action
            </Button>
          }
        />
        {custom.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Globe />}
            title="Teach it to do things"
            description="“Create a campaign”, “Reset my API key”, “Check my order status”. Describe the action and its inputs, and the model decides when to use it."
          />
        ) : (
          <Card className="mt-4 divide-y divide-line overflow-hidden">
            {custom.map((action) => (
              <ToolRow
                key={action.id}
                icon={action.kind === "http" ? Globe : MonitorSmartphone}
                title={action.title}
                tool={action.name}
                description={action.description}
                parameters={action.parameters}
                muted={!action.enabled}
                badges={
                  <>
                    <WhereBadge where={action.kind === "http" ? "api" : "page"} />
                    {action.requires_identity && (
                      <Badge tone="outline">
                        <UserCheck /> Signed-in users
                      </Badge>
                    )}
                    {action.requires_confirmation && (
                      <Badge tone="warning">
                        <ShieldCheck /> Confirms first
                      </Badge>
                    )}
                  </>
                }
                menu={
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-ink" aria-label="Options">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(action)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        destructive
                        onSelect={() =>
                          runAction(() => actionDeleteAction(agentId, action.id), { success: "Deleted", onSuccess: () => router.refresh() })
                        }
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
                control={
                  <Switch checked={action.enabled} onCheckedChange={(value) => setFlags(action, { enabled: value })} aria-label={action.title} />
                }
              />
            ))}
          </Card>
        )}
      </section>

      <ActionEditor agentId={agentId} action={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </div>
  );
}
