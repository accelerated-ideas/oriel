"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Cookie, CreditCard, LogOut, PenLine, Plus } from "lucide-react";
import { ANALYTICS_ENABLED } from "@/config/analytics";
import { openSettings } from "@/components/consent/consent-store";
import { actionSignOut } from "@/server-actions/auth";
import { actionCreateWorkspace, actionRenameWorkspace } from "@/server-actions/workspaces";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/input";
import { MonsterAvatar } from "@/components/ui/monster-avatar";
import type { OrganizationRole } from "@/lib/types";

export type UserMenuProps = {
  user: { id: string; email: string };
  organization: { id: string; name: string };
  role: OrganizationRole;
  workspaces: { id: string; name: string }[];
  // Plan summary for the Billing item, e.g. "Trial, 9 days left". Null hides Billing.
  billing: string | null;
  onNavigate?: () => void;
};

const ROLE_LABEL: Record<OrganizationRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-ink text-[10.5px] font-semibold text-white">
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

// The account card at the bottom of the sidebar. Opens a menu with the
// workspace's billing, switching workspaces, and signing out.
export function UserMenu({ user, organization, role, workspaces, billing, onNavigate }: UserMenuProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [, startSignOut] = useTransition();
  const canManage = role !== "member";
  const base = `/account/${organization.id}`;

  const openDialog = (kind: "new" | "rename") => {
    setName(kind === "rename" ? organization.name : "");
    setDialog(kind);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    if (dialog === "new") {
      await runAction(() => actionCreateWorkspace({ name }), {
        onSuccess: (result) => {
          setDialog(null);
          onNavigate?.();
          router.push(`/account/${result.data.id}/agents`);
        },
      });
    } else {
      await runAction(() => actionRenameWorkspace({ organizationId: organization.id, name }), {
        success: "Workspace renamed",
        onSuccess: () => {
          setDialog(null);
          router.refresh();
        },
      });
    }
    setSaving(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="group flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-[background-color,box-shadow] duration-150 outline-none hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] data-[state=open]:bg-surface data-[state=open]:shadow-border">
          <MonsterAvatar seed={user.id} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] leading-tight font-medium text-ink">{user.email}</span>
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted">{organization.name}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-faint transition-colors group-hover:text-muted" />
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-[264px] p-1.5">
          <div className="flex items-center gap-3 px-2 pt-1.5 pb-2.5">
            <MonsterAvatar seed={user.id} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink">{user.email}</p>
              <p className="truncate text-[12.5px] text-muted">
                {ROLE_LABEL[role]} of {organization.name}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />

          {billing !== null && (
            <DropdownMenuItem asChild>
              <Link href={`${base}/billing`} onClick={onNavigate}>
                <CreditCard /> Billing
                <span className="ml-auto truncate pl-3 text-[12px] text-muted">{billing}</span>
              </Link>
            </DropdownMenuItem>
          )}
          {canManage && (
            <DropdownMenuItem onSelect={() => openDialog("rename")}>
              <PenLine /> Rename workspace
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />

          {workspaces.length > 1 && (
            <>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {workspaces.map((workspace) => (
                <DropdownMenuItem key={workspace.id} asChild>
                  <Link href={`/account/${workspace.id}/agents`} onClick={onNavigate}>
                    <WorkspaceMark name={workspace.name} />
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    {workspace.id === organization.id && <Check className="!text-ink" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuItem onSelect={() => openDialog("new")}>
            <Plus /> New workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {ANALYTICS_ENABLED && (
            // Changing the analytics choice is as easy as making it (see consent-banner.tsx).
            <DropdownMenuItem onSelect={openSettings}>
              <Cookie /> Cookie settings
            </DropdownMenuItem>
          )}
          {/* Not a <form>: choosing an item closes the menu and unmounts it before
              the browser submits, so the submission would be dropped. */}
          <DropdownMenuItem onSelect={() => startSignOut(() => actionSignOut())}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent size="sm">
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader
              title={dialog === "rename" ? "Rename workspace" : "New workspace"}
              description={dialog === "new" ? "A separate set of assistants, members and billing." : undefined}
            />
            <DialogBody>
              <Field label="Name" htmlFor="workspace-name">
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Acme"
                  autoFocus
                  maxLength={60}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} disabled={!name.trim()}>
                {dialog === "rename" ? "Save" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
