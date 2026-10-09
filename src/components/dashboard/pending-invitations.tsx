"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionAcceptInvitation, actionDeclineInvitation } from "@/server-actions/workspaces";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";

type PendingInvitation = { id: string; token: string; workspace: { id: string; name: string } };

// Invitations to other workspaces, shown on the dashboard home.
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  if (invitations.length === 0) return null;

  const respond = async (invitation: PendingInvitation, accept: boolean) => {
    setPending(invitation.id);
    const result = accept
      ? await runAction(() => actionAcceptInvitation({ token: invitation.token }), {
          onSuccess: (result) => router.push(`/account/${result.data.organizationId}/agents`),
        })
      : await runAction(() => actionDeclineInvitation({ invitationId: invitation.id }), { onSuccess: () => router.refresh() });
    if (!result || !accept) setPending(null);
  };

  return (
    <div className="mt-6 flex flex-col gap-2">
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-col gap-3 rounded-2xl bg-accent-soft/60 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(99_82_242/0.14)] sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-3 text-[14.5px] text-ink">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-white">
              {invitation.workspace.name.trim().charAt(0).toUpperCase() || "W"}
            </span>
            <span>
              You&apos;re invited to join <span className="font-semibold">{invitation.workspace.name}</span>.
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void respond(invitation, false)}>
              Decline
            </Button>
            <Button size="sm" loading={pending === invitation.id} disabled={pending !== null} onClick={() => void respond(invitation, true)}>
              Join
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
