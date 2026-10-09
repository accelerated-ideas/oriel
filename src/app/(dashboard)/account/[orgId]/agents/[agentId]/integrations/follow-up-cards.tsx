"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Webhook } from "lucide-react";
import { actionUpdateAgent } from "@/server-actions/agents";
import { actionTestFollowUp } from "@/server-actions/integrations";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/misc";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { ConfigureButton } from "./integration-ui";

// Where follow-up requests go besides Insights (and Slack, when it's
// connected): an email address and a webhook, both stored on the assistant
// and sent by src/lib/runtime/handoff.ts.

type Kind = "email" | "webhook";

// What a webhook receives, for the drawer.
const SAMPLE_PAYLOAD = `{
  "type": "handoff",
  "assistant": { "id": "…", "name": "Ava" },
  "conversation": {
    "id": "…",
    "url": "https://…",
    "page_url": "https://…"
  },
  "user": {
    "id": "…",
    "email": "maya@example.com",
    "name": "Maya",
    "verified": true
  },
  "summary": "Charged twice in October, wants a refund.",
  "created_at": "2026-10-09T10:00:00.000Z"
}`;

export function FollowUpCards({
  agentId,
  assistantName,
  email,
  webhookUrl,
  emailReady,
}: {
  agentId: string;
  assistantName: string;
  email: string | null;
  webhookUrl: string | null;
  // Whether this server can send email (RESEND_API_KEY).
  emailReady: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <DestinationCard
        agentId={agentId}
        kind="email"
        icon={Mail}
        title="Email"
        description={`Emails your team when ${assistantName} can't resolve something, with a summary and a link to the conversation.`}
        value={email}
        field={{ label: "Send follow-ups to", placeholder: "support@yourcompany.com", type: "email" }}
        hint="When the visitor left an email address, replying to the email goes to them."
        unavailable={emailReady ? null : "Sending email isn't set up on this server (RESEND_API_KEY), so nothing goes out yet."}
        test="Send a test email"
      />
      <DestinationCard
        agentId={agentId}
        kind="webhook"
        icon={Webhook}
        title="Webhook"
        description="Sends follow-up requests to your own system as JSON, to open a ticket or ping a tool we don't connect to."
        value={webhookUrl}
        field={{ label: "Endpoint", placeholder: "https://yourcompany.com/hooks/oriel", type: "url" }}
        hint="We POST this JSON to it:"
        extra={
          <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
            {SAMPLE_PAYLOAD}
          </pre>
        }
        test="Send a test request"
      />
    </div>
  );
}

function DestinationCard({
  agentId,
  kind,
  icon: Icon,
  title,
  description,
  value,
  field,
  hint,
  extra,
  unavailable,
  test,
}: {
  agentId: string;
  kind: Kind;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  value: string | null;
  field: { label: string; placeholder: string; type: "email" | "url" };
  hint: string;
  extra?: React.ReactNode;
  unavailable?: string | null;
  test: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [testing, setTesting] = useState(false);
  const key = kind === "email" ? "handoff_email" : "handoff_webhook_url";
  const dirty = draft.trim() !== (value ?? "");

  function show() {
    setDraft(value ?? "");
    setOpen(true);
  }

  async function save(next: string) {
    setBusy(next ? "save" : "remove");
    await runAction(() => actionUpdateAgent(agentId, { [key]: next }), {
      success: next ? "Saved" : `${title} removed`,
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    });
    setBusy(null);
  }

  async function sendTest() {
    setTesting(true);
    const result = await runAction(() => actionTestFollowUp(agentId, kind));
    if (result) toast.success(result.data.note);
    setTesting(false);
  }

  return (
    <Card className="flex items-center gap-4 p-5 sm:p-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_6px_-2px_rgb(0_0_0/0.35)]">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          {value && (unavailable ? <Badge tone="warning">Not sending</Badge> : <Badge tone="success">On</Badge>)}
        </div>
        <p className={cn("mt-0.5 text-[13.5px] text-muted", value ? "truncate" : "text-pretty")}>{value ?? description}</p>
      </div>
      {value ? (
        <ConfigureButton onClick={show} />
      ) : (
        <Button size="sm" variant="outline" onClick={show}>
          Set up
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="max-w-[520px]">
          <SheetHeader title={title} description={description} />
          <SheetBody className="flex flex-col gap-6 pt-1">
            {unavailable && <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning-ink">{unavailable}</p>}
            <Field label={field.label} htmlFor={`follow-up-${kind}`}>
              <Input
                id={`follow-up-${kind}`}
                type={field.type}
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={field.placeholder}
              />
            </Field>
            <div>
              <p className="text-[13px] text-muted">{hint}</p>
              {extra}
            </div>
            {value && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                loading={testing}
                // A test goes to what's saved.
                disabled={dirty || Boolean(unavailable)}
                title={dirty ? "Save your changes first" : undefined}
                onClick={() => void sendTest()}
              >
                {test}
              </Button>
            )}
          </SheetBody>
          <SheetFooter>
            {value ? (
              <Button variant="ghost" className="text-danger hover:text-danger" loading={busy === "remove"} onClick={() => void save("")}>
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={busy === "save"} disabled={!dirty || !draft.trim()} onClick={() => void save(draft.trim())}>
                Save
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
