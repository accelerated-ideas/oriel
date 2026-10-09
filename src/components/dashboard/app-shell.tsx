"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CircleDollarSign,
  Code2,
  FlaskConical,
  Lightbulb,
  Map,
  Menu,
  MessagesSquare,
  Plug,
  SlidersHorizontal,
  Users,
  Zap,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Logo } from "@/components/dashboard/logo";
import { UserMenu, type UserMenuProps } from "@/components/dashboard/user-menu";
import { cn } from "@/lib/utils";

export type ShellProps = Omit<UserMenuProps, "onNavigate"> & {
  currentAgentId?: string;
  // Platform admins also get a link to what everything costs us.
  showCosts?: boolean;
  children: React.ReactNode;
};

const AGENT_NAV = [
  { segment: "playground", label: "Playground", icon: FlaskConical },
  { segment: "conversations", label: "Conversations", icon: MessagesSquare },
  { segment: "insights", label: "Insights", icon: Lightbulb },
  { segment: "knowledge", label: "Knowledge", icon: BookOpen },
  { segment: "site-map", label: "Site map", icon: Map },
  { segment: "actions", label: "Actions", icon: Zap },
  { segment: "integrations", label: "Integrations", icon: Plug },
  { segment: "behavior", label: "Behavior", icon: SlidersHorizontal },
  { segment: "install", label: "Install", icon: Code2 },
] as const;

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[14px] transition-[background-color,color,box-shadow] duration-150 [&_svg]:size-[17px]",
        active ? "bg-surface font-medium text-ink shadow-border" : "text-ink-2 hover:bg-black/[0.04] hover:text-ink",
      )}
    >
      <Icon
        className={cn("transition-colors duration-150", active ? "text-accent" : "text-faint group-hover:text-muted")}
        strokeWidth={active ? 2 : 1.75}
      />
      {label}
    </Link>
  );
}

function SidebarContent({
  currentAgentId,
  showCosts,
  onNavigate,
  ...account
}: Omit<ShellProps, "children"> & { onNavigate?: () => void }) {
  const { organization } = account;
  const pathname = usePathname();
  const base = `/account/${organization.id}/agents`;

  return (
    <div className="flex h-full flex-col">
      <div className="px-2.5 pt-1 pb-6">
        <Logo href={base} />
      </div>

      {/* Inside an assistant: its sections. On the dashboard home: workspace pages. */}
      <nav className="flex flex-col gap-0.5">
        {currentAgentId ? (
          AGENT_NAV.map((item) => {
            const href = `${base}/${currentAgentId}/${item.segment}`;
            return (
              <SidebarLink
                key={item.segment}
                href={href}
                icon={item.icon}
                label={item.label}
                active={pathname.startsWith(href)}
                onNavigate={onNavigate}
              />
            );
          })
        ) : (
          <>
            <SidebarLink href={base} icon={MessagesSquare} label="Assistants" active={pathname === base} onNavigate={onNavigate} />
            <SidebarLink
              href={`/account/${organization.id}/usage`}
              icon={BarChart3}
              label="Usage"
              active={pathname.startsWith(`/account/${organization.id}/usage`)}
              onNavigate={onNavigate}
            />
            <SidebarLink
              href={`/account/${organization.id}/members`}
              icon={Users}
              label="Members"
              active={pathname.startsWith(`/account/${organization.id}/members`)}
              onNavigate={onNavigate}
            />
            {showCosts && (
              <SidebarLink
                href="/admin/costs"
                icon={CircleDollarSign}
                label="Costs"
                active={pathname.startsWith("/admin/costs")}
                onNavigate={onNavigate}
              />
            )}
          </>
        )}
      </nav>

      <div className="mt-auto" />

      <div className="border-t border-black/[0.06] pt-2">
        <UserMenu {...account} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function AppShell(props: ShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 px-3 py-4 lg:block">
        <SidebarContent {...props} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col p-2 lg:pl-0">
        <div className="flex items-center justify-between px-2 pb-2 lg:hidden">
          <Logo href={`/account/${props.organization.id}/agents`} />
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger className="rounded-lg p-2 hover:bg-black/[0.05]" aria-label="Open menu">
              <Menu className="size-5" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30" />
              <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[280px] bg-canvas px-3 py-4 shadow-float data-[state=open]:animate-fade-in">
                <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
                <SidebarContent {...props} onNavigate={() => setOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
        <main className="min-h-[calc(100dvh-16px)] flex-1 rounded-2xl bg-surface shadow-border">
          {props.children}
        </main>
      </div>
    </div>
  );
}

// Every dashboard page uses the same width.
export function PageBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1080px] px-5 py-8 sm:px-8 sm:py-10", className)} {...props} />;
}
