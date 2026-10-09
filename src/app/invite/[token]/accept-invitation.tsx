"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionAcceptInvitation, actionDeclineInvitation } from "@/server-actions/workspaces";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token, invitationId }: { token: string; invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  const accept = async () => {
    setPending("accept");
    const result = await runAction(() => actionAcceptInvitation({ token }), {
      onSuccess: (result) => router.push(`/account/${result.data.organizationId}/agents`),
    });
    if (!result) setPending(null);
  };

  const decline = async () => {
    setPending("decline");
    const result = await runAction(() => actionDeclineInvitation({ invitationId }), {
      onSuccess: () => router.push("/account"),
    });
    if (!result) setPending(null);
  };

  return (
    <div className="mt-8 flex flex-col gap-2">
      <Button
        size="lg"
        variant="dark"
        onClick={accept}
        loading={pending === "accept"}
        disabled={pending !== null}
        className="h-12 rounded-full text-[15px]"
      >
        Join workspace
      </Button>
      <Button
        size="lg"
        variant="ghost"
        onClick={decline}
        loading={pending === "decline"}
        disabled={pending !== null}
        className="h-12 rounded-full text-[15px]"
      >
        Decline
      </Button>
    </div>
  );
}
