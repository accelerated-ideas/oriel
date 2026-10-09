import "server-only";
import { appUrl } from "@/config/brand";
import { assertPublicUrl } from "@/lib/actions/ssrf";
import { sendEmail } from "@/lib/email";
import { escape as escapeSlack, postToSlack } from "@/lib/integrations/providers/slack";
import { loadConnection } from "@/lib/integrations/store";
import type { Agent, Conversation } from "@/lib/types";

// Asks the customer's team to follow up with a visitor: webhook, email (Resend),
// and the Slack channel when Slack is connected with follow-ups switched on.
// Nobody joins the conversation live; the team replies later.
export async function notifyHandoff({
  agent,
  conversation,
  summary,
  email,
  insightId,
}: {
  agent: Agent;
  conversation: Conversation;
  summary: string;
  email: string | null;
  insightId: string | null;
}) {
  const transcriptUrl = appUrl(`/account/${agent.organization_id}/agents/${agent.id}/conversations/${conversation.id}`);
  const payload = {
    type: "handoff",
    insight_id: insightId,
    assistant: { id: agent.id, name: agent.assistant_name },
    conversation: { id: conversation.id, url: transcriptUrl, page_url: conversation.page_url },
    user: {
      id: conversation.user_external_id,
      email,
      name: conversation.user_name,
      verified: conversation.user_verified,
    },
    summary,
    created_at: new Date().toISOString(),
  };

  const tasks: Promise<unknown>[] = [];

  if (agent.handoff_webhook_url) {
    tasks.push(
      (async () => {
        await assertPublicUrl(agent.handoff_webhook_url!);
        await fetch(agent.handoff_webhook_url!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
      })(),
    );
  }

  if (agent.handoff_email) {
    const lines = [
      `${agent.assistant_name} needs your team to follow up with a visitor.`,
      "",
      summary,
      "",
      email ? `Reply to: ${email}` : "The user didn't leave an email.",
      conversation.page_url ? `Page: ${conversation.page_url}` : null,
      `Transcript: ${transcriptUrl}`,
    ].filter((line) => line !== null);
    tasks.push(
      sendEmail({
        to: agent.handoff_email,
        replyTo: email ?? undefined,
        subject: `Follow-up: ${summary.slice(0, 80)}`,
        text: lines.join("\n"),
      }),
    );
  }

  tasks.push(
    (async () => {
      const slack = await loadConnection(agent.id, "slack");
      if (!slack || !slack.config.channel || slack.config.post_handoffs === false) return;
      await postToSlack(slack, {
        title: `${agent.assistant_name} needs a follow-up`,
        body: summary,
        details: [
          email ? `Reply to ${escapeSlack(email)}` : "No email left",
          conversation.page_url ? `<${conversation.page_url}|Page they're on>` : null,
          `<${transcriptUrl}|Open the conversation>`,
        ],
      });
    })(),
  );

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.error("Follow-up notification failed", result.reason);
  }
}
