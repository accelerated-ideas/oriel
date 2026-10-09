"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Check, Copy, MoreHorizontal, UserPlus } from "lucide-react";
import {
  actionChangeMemberRole,
  actionInviteMember,
  actionRemoveMember,
  actionRevokeInvitation,
} from "@/server-actions/workspaces";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/misc";
import { MonsterAvatar } from "@/components/ui/monster-avatar";
import { Select } from "@/components/ui/select";
import type { OrganizationRole } from "@/lib/types";
import { cn } from "@/lib/utils";

type Member = { userId: string; email: string; role: OrganizationRole; joinedAt: string };
type Invitation = { id: string; email: string; role: "admin" | "member"; createdAt: string; expiresAt: string; link: string | null };

const ROLE_OPTIONS = [
  { value: "member", label: "Member", description: "Builds and runs assistants" },
  { value: "admin", label: "Admin", description: "Also invites people and manages billing" },
];

function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      <span className="relative size-3.5">
        <Copy
          className={cn(
            "absolute inset-0 transition-[opacity,scale,filter] duration-200 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
            copied ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
          )}
        />
        <Check
          className={cn(
            "absolute inset-0 text-success-ink transition-[opacity,scale,filter] duration-200 [transition-timing-function:cubic-bezier(0.2,0,0,1)]",
            copied ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        />
      </span>
      {copied ? "Copied" : label}
    </Button>
  );
}

export function InviteButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(false);
  // Shown when the invitation couldn't be emailed.
  const [link, setLink] = useState<string | null>(null);

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEmail("");
      setRole("member");
      setLink(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    await runAction(() => actionInviteMember({ organizationId, email, role }), {
      onSuccess: (result) => {
        router.refresh();
        if (result.data.emailed) {
          toast.success(`Invitation sent to ${email.trim()}`);
          reset(false);
        } else {
          setLink(result.data.link);
        }
      },
    });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        {link ? (
          <div className="flex min-h-0 flex-col">
            <DialogHeader title="Share the invitation" description={`Send this link to ${email.trim()}. It works for 14 days.`} />
            <DialogBody>
              <div className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pr-1.5 pl-3.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{link}</code>
                <CopyButton text={link} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={() => reset(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader title="Invite to workspace" />
            <DialogBody className="flex flex-col gap-5">
              <Field label="Email" htmlFor="invite-email">
                <Input
                  id="invite-email"
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@company.com"
                />
              </Field>
              <Field label="Role" htmlFor="invite-role" hint={ROLE_OPTIONS.find((option) => option.value === role)?.description}>
                <Select
                  id="invite-role"
                  value={role}
                  onValueChange={(value) => setRole(value as "admin" | "member")}
                  options={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => reset(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={loading} disabled={!email.trim()}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <li className={cn("flex items-center gap-3.5 px-4 py-3.5 sm:px-5", className)}>
      {children}
    </li>
  );
}

export function MembersBody({
  organizationId,
  currentUserId,
  canManage,
  members,
  invitations,
}: {
  organizationId: string;
  currentUserId: string;
  canManage: boolean;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();

  const changeRole = (userId: string, role: string) =>
    runAction(() => actionChangeMemberRole({ organizationId, userId, role: role as "admin" | "member" }), {
      success: "Role updated",
      onSuccess: () => router.refresh(),
    });

  const remove = (member: Member) =>
    runAction(() => actionRemoveMember({ organizationId, userId: member.userId }), {
      success: member.userId === currentUserId ? "You left the workspace" : `${member.email} was removed`,
      onSuccess: () => (member.userId === currentUserId ? router.push("/account") : router.refresh()),
    });

  const revoke = (invitation: Invitation) =>
    runAction(() => actionRevokeInvitation({ organizationId, invitationId: invitation.id }), {
      success: "Invitation revoked",
      onSuccess: () => router.refresh(),
    });

  return (
    <div className="mt-8 flex flex-col gap-8">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {members.map((member) => {
            const isYou = member.userId === currentUserId;
            const editable = canManage && member.role !== "owner" && !isYou;
            const removable = member.role !== "owner" && (canManage || isYou);
            return (
              <Row key={member.userId}>
                <MonsterAvatar seed={member.userId} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[14.5px] font-medium">
                    <span className="truncate">{member.email}</span>
                    {isYou && <Badge tone="neutral">You</Badge>}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">Joined {format(new Date(member.joinedAt), "MMM d, yyyy")}</p>
                </div>
                {editable ? (
                  <Select
                    value={member.role}
                    onValueChange={(role) => void changeRole(member.userId, role)}
                    options={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))}
                    className="h-9 w-[118px]"
                  />
                ) : (
                  <span className="w-[118px] text-right text-[13.5px] text-muted sm:pr-3 sm:text-left">
                    {member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Member"}
                  </span>
                )}
                <div className="w-8">
                  {removable && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`Options for ${member.email}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem destructive onSelect={() => void remove(member)}>
                          {isYou ? "Leave workspace" : "Remove from workspace"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Row>
            );
          })}
        </ul>
      </Card>

      {invitations.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold">Invitations</h2>
          <Card className="mt-3 overflow-hidden">
            <ul className="divide-y divide-line">
              {invitations.map((invitation) => {
                const expired = new Date(invitation.expiresAt) < new Date();
                return (
                  <Row key={invitation.id}>
                    <MonsterAvatar seed={invitation.email} size={38} className={cn(expired && "opacity-50 grayscale")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{invitation.email}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {invitation.role === "admin" ? "Admin" : "Member"} ·{" "}
                        {expired
                          ? "Expired"
                          : `Invited ${formatDistanceToNowStrict(new Date(invitation.createdAt), { addSuffix: true })}`}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        {invitation.link && !expired && <CopyButton text={invitation.link} />}
                        <Button size="sm" variant="ghost" onClick={() => void revoke(invitation)}>
                          {expired ? "Remove" : "Revoke"}
                        </Button>
                      </div>
                    )}
                  </Row>
                );
              })}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
