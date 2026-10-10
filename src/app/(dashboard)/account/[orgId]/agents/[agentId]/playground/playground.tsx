"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw, UserRound } from "lucide-react";
import { BRAND } from "@/config/brand";
import { actionPlaygroundCustomers, actionPlaygroundIdentity, type TestCustomer, type TestIdentity } from "@/server-actions/playground";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";

const HOST = `${BRAND.messagePrefix}-host`;
const WIDGET = `${BRAND.messagePrefix}-widget`;

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the conversation just won't survive a reload.
  }
}

// Who the Playground tests as: a visitor, or a customer signed in to the site.
type TestAs = { choice: TestIdentity; label: string; stripe: boolean; token: string };

function storedChoice(key: string): TestIdentity | null {
  try {
    const choice = JSON.parse(stored(key) ?? "null") as TestIdentity | null;
    return choice && (choice.email || choice.customerId) ? choice : null;
  } catch {
    return null;
  }
}

// The assistant's real widget, in a box on this page. Plays the part the
// embed script plays on a website: starts the widget, keeps its conversation,
// and answers its requests. There's no site here, so in-page tools decline.
export function Playground({ agentId, siteUrl, siteName }: { agentId: string; siteUrl: string; siteName: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [run, setRun] = useState(0);
  const [origin, setOrigin] = useState<string | null>(null);
  const [testAs, setTestAs] = useState<TestAs | null>(null);
  // The widget waits until a remembered customer has a fresh token.
  const [ready, setReady] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const identityRef = useRef<string | null>(null);
  const conversationKey = `${BRAND.messagePrefix}:playground:${agentId}`;
  const testAsKey = `${BRAND.messagePrefix}:playground-as:${agentId}`;

  useEffect(() => setOrigin(window.location.origin), []);

  // A customer chosen before is tested as again, with a newly signed token.
  useEffect(() => {
    const choice = storedChoice(testAsKey);
    if (!choice) {
      setReady(true);
      return;
    }
    void actionPlaygroundIdentity(agentId, choice)
      .then((result) => {
        if (result.ok) {
          identityRef.current = result.data.token;
          setTestAs({ choice, ...result.data });
        } else {
          store(testAsKey, null);
        }
      })
      .catch(() => store(testAsKey, null))
      .finally(() => setReady(true));
  }, [agentId, testAsKey]);

  useEffect(() => {
    const post = (type: string, payload: unknown) =>
      frameRef.current?.contentWindow?.postMessage({ source: HOST, type, payload }, window.location.origin);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
      if (!data || data.source !== WIDGET) return;
      if (data.type === "ready") {
        let visitorId = stored(`${BRAND.messagePrefix}:playground-visitor`);
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          store(`${BRAND.messagePrefix}:playground-visitor`, visitorId);
        }
        post("init", {
          visitorId,
          conversationId: stored(conversationKey),
          // The assistant answers as if the visitor were on the site's home page.
          page: { url: siteUrl || window.location.href, title: siteName, text: null, referrer: null },
          identity: identityRef.current ? { token: identityRef.current } : {},
          mode: "text",
          autostart: false,
          resume: null,
          preview: true,
          open: true,
        });
      } else if (data.type === "session") {
        store(conversationKey, String(data.payload?.conversationId ?? ""));
      } else if (data.type === "tool") {
        const kind = data.payload?.kind;
        post("tool-result", {
          requestId: data.payload?.requestId,
          ok: false,
          output:
            kind === "client_action"
              ? "Actions from the site's own code don't run in the playground. Say it would run on the site."
              : "The playground isn't the site, so this can't happen here. Say what would happen on the site instead.",
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [conversationKey, siteName, siteUrl]);

  const startOver = () => {
    store(conversationKey, null);
    setRun((value) => value + 1);
  };

  // A different person means a different conversation.
  const switchTo = (next: TestAs | null) => {
    identityRef.current = next?.token ?? null;
    store(testAsKey, next ? JSON.stringify(next.choice) : null);
    setTestAs(next);
    setChoosing(false);
    startOver();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-surface py-2 pr-2 pl-4 shadow-border">
        <UserRound className="size-4 shrink-0 text-muted" />
        <p className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
          {testAs ? (
            <>
              <span className="shrink-0 text-muted">Signed in as</span>
              <span className="truncate font-medium">{testAs.label}</span>
              {testAs.stripe && <Badge className="shrink-0">Stripe customer</Badge>}
            </>
          ) : (
            <span className="text-muted">A visitor who isn&apos;t signed in</span>
          )}
        </p>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setChoosing(true)}>
          {testAs ? "Change" : "Test as a customer"}
        </Button>
      </div>
      <div className="h-[min(720px,calc(100dvh-220px))] min-h-[520px] overflow-hidden rounded-[28px] bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_16px_-4px_rgb(0_0_0/0.08),0_32px_72px_-16px_rgb(0_0_0/0.24)]">
        {origin && ready && (
          <iframe
            key={run}
            ref={frameRef}
            title="Playground"
            src={`/widget/${agentId}?origin=${encodeURIComponent(origin)}&inline=1`}
            allow="microphone; autoplay; clipboard-write"
            className="block size-full border-0"
          />
        )}
      </div>
      <Button variant="ghost" size="sm" className="self-center" onClick={startOver}>
        <RotateCcw /> New conversation
      </Button>
      <TestAsDialog agentId={agentId} open={choosing} current={testAs} onClose={() => setChoosing(false)} onChoose={switchTo} />
    </div>
  );
}

// Choosing who to test as: an email or a Stripe customer ID, or one of the
// connected Stripe account's recent customers.
function TestAsDialog({
  agentId,
  open,
  current,
  onClose,
  onChoose,
}: {
  agentId: string;
  open: boolean;
  current: TestAs | null;
  onClose: () => void;
  onChoose: (next: TestAs | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<TestCustomer[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stripe's recent customers, fetched once the dialog first opens.
  useEffect(() => {
    if (!open || customers) return;
    void actionPlaygroundCustomers(agentId)
      .then((result) => setCustomers(result.ok ? result.data.customers : []))
      .catch(() => setCustomers([]));
  }, [agentId, customers, open]);

  const start = async (choice: TestIdentity) => {
    setSaving(true);
    setError(null);
    const result = await actionPlaygroundIdentity(agentId, choice).catch(() => null);
    setSaving(false);
    if (!result?.ok) {
      setError(result?.error ?? "Couldn't start. Try again.");
      return;
    }
    setEmail("");
    setCustomerId("");
    onChoose({ choice, ...result.data });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent size="sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void start({ email: email.trim() || undefined, customerId: customerId.trim() || undefined });
          }}
        >
          <DialogHeader
            title="Test as a customer"
            description="The assistant treats you as this person, signed in to your site. With Stripe connected, it answers from their billing."
          />
          <DialogBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <Field label="Email" htmlFor="test-as-email" optional>
                <Input
                  id="test-as-email"
                  type="email"
                  autoFocus
                  autoComplete="off"
                  placeholder="maya@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                />
              </Field>
              <Field label="Stripe customer ID" htmlFor="test-as-customer" optional error={error ?? undefined}>
                <Input
                  id="test-as-customer"
                  autoComplete="off"
                  placeholder="cus_…"
                  value={customerId}
                  onChange={(event) => {
                    setCustomerId(event.target.value);
                    setError(null);
                  }}
                  aria-invalid={Boolean(error)}
                  className="font-mono"
                />
              </Field>
            </div>
            {customers && customers.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-ink-2">Recent customers in Stripe</p>
                <ul className="mt-2 flex flex-col overflow-hidden rounded-xl shadow-border">
                  {customers.map((customer) => (
                    <li key={customer.id} className="border-t border-line first:border-t-0">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void start({ customerId: customer.id, email: customer.email ?? undefined })}
                        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{customer.name ?? customer.email ?? customer.id}</span>
                          {customer.name && customer.email && <span className="block truncate text-[12.5px] text-muted">{customer.email}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-[11.5px] text-faint">{customer.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DialogBody>
          <DialogFooter className="justify-between">
            {current ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => onChoose(null)}>
                Test as a visitor
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} disabled={!email.trim() && !customerId.trim()}>
                Start
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
