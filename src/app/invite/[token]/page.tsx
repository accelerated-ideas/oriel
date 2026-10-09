import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findInvitation, isExpired } from "@/lib/workspaces/invitations";
import { actionSignOut } from "@/server-actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { MonsterAvatar } from "@/components/ui/monster-avatar";
import { cn } from "@/lib/utils";
import { AcceptInvitation } from "./accept-invitation";

export const metadata: Metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

const HEADING = "headline text-[40px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[46px]";

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span className="headline flex size-14 items-center justify-center rounded-2xl bg-ink text-[26px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_20px_-8px_rgb(0_0_0/0.5)]">
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [found, user] = await Promise.all([findInvitation(token), getUser()]);

  if (!found || isExpired(found.invitation)) {
    return (
      <AuthShell>
        <h1 className={HEADING}>This invitation has expired</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">Ask whoever invited you to send a new one.</p>
        <Button asChild size="lg" variant="outline" className="mt-8 h-12 w-full rounded-full text-[15px]">
          <Link href={user ? "/account" : "/auth"}>{user ? "Go to your dashboard" : "Sign in"}</Link>
        </Button>
      </AuthShell>
    );
  }

  const { invitation, workspaceName } = found;
  const { data: inviter } = invitation.invited_by
    ? await supabaseAdmin.from("users").select("id, email").eq("id", invitation.invited_by).maybeSingle()
    : { data: null };
  const signInUrl = `/auth?${new URLSearchParams({ next: `/invite/${token}`, email: invitation.email })}`;
  const wrongAccount = user && (user.email ?? "").toLowerCase() !== invitation.email.toLowerCase();

  return (
    <AuthShell>
      <div className="flex items-center">
        <WorkspaceMark name={workspaceName} />
        {inviter && <MonsterAvatar seed={inviter.id} size={44} className="-ml-3 ring-4 ring-surface" />}
      </div>
      <h1 className={cn(HEADING, "mt-7")}>Join {workspaceName}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-pretty text-muted">
        {inviter?.email ? <span className="font-medium text-ink">{inviter.email}</span> : "A teammate"} invited you as{" "}
        {invitation.role === "admin" ? "an admin" : "a member"}.
      </p>

      {!user ? (
        <Button asChild size="lg" variant="dark" className="mt-8 h-12 w-full rounded-full text-[15px]">
          <Link href={signInUrl}>Sign in to accept</Link>
        </Button>
      ) : wrongAccount ? (
        <>
          <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-[14px] leading-relaxed text-ink-2">
            This invitation is for <span className="font-medium text-ink">{invitation.email}</span>, but you&apos;re signed
            in as <span className="font-medium text-ink">{user.email}</span>.
          </p>
          <form action={actionSignOut} className="mt-6">
            <input type="hidden" name="next" value={`/invite/${token}`} />
            <input type="hidden" name="email" value={invitation.email} />
            <Button type="submit" size="lg" variant="dark" className="h-12 w-full rounded-full text-[15px]">
              Switch account
            </Button>
          </form>
        </>
      ) : (
        <AcceptInvitation token={token} invitationId={invitation.id} />
      )}
    </AuthShell>
  );
}
