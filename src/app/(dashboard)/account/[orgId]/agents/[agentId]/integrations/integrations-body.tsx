"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { BRAND } from "@/config/brand";
import { actionConnectStripe, actionDisconnectStripe, actionSaveStripe } from "@/server-actions/actions";
import { runAction } from "@/lib/run-action";
import { STRIPE_OPERATIONS } from "@/lib/actions/stripe-catalog";
import type { Integration } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StripeLogo, StripeMark } from "@/components/brand/stripe-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/misc";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import type { StripeOperation } from "@/lib/types";
import { PlansDialog } from "../actions/plans-dialog";
import type { SafeAction } from "../actions/tool-row";
import { ConfigureButton, ConfirmFirst, DrawerSection, JobRow } from "./integration-ui";

type StripeMetadata = {
  account_name?: string;
  livemode?: boolean;
  key_hint?: string;
  connected_via?: "app" | "key";
  mode?: "live" | "sandbox";
};

// Where the app can be installed on this server (src/lib/integrations/stripe.ts).
type AppMode = "live" | "sandbox";

type Flags = { enabled: boolean; requires_confirmation: boolean };

const NOTICES: Record<string, () => void> = {
  connected: () => toast.success("Stripe connected"),
  cancelled: () => toast("Connecting to Stripe was cancelled"),
  failed: () => toast.error("Couldn't connect Stripe. Try again."),
};

export function IntegrationsBody({
  agentId,
  assistantName,
  stripe,
  stripeActions,
  appModes,
  permissions,
  notice,
}: {
  agentId: string;
  assistantName: string;
  stripe: Pick<Integration, "id" | "metadata" | "config" | "created_at"> | null;
  stripeActions: SafeAction[];
  appModes: AppMode[];
  permissions: { resource: string; access: string }[];
  notice: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const connected = Boolean(stripe);
  const metadata = (stripe?.metadata ?? {}) as StripeMetadata;
  const matchByEmail = (stripe?.config as { match_by_email?: boolean } | undefined)?.match_by_email === true;
  const connectHref = (mode: AppMode) => `/api/integrations/stripe/connect?${new URLSearchParams({ agentId, mode })}`;
  const [connecting, setConnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [plansFor, setPlansFor] = useState<SafeAction | null>(null);
  // The Configure drawer's draft, saved with its Save button.
  const [emailDraft, setEmailDraft] = useState<boolean | null>(null);
  const [flags, setFlags] = useState<Record<string, Flags>>({});
  const [saving, setSaving] = useState(false);
  const flagsOf = (action: SafeAction): Flags =>
    flags[action.id] ?? { enabled: action.enabled, requires_confirmation: action.requires_confirmation };
  const change = (action: SafeAction, patch: Partial<Flags>) =>
    setFlags((current) => ({ ...current, [action.id]: { ...(current[action.id] ?? flagsOf(action)), ...patch } }));
  const changedFlags = stripeActions
    .filter((action) => flags[action.id])
    .map((action) => ({ id: action.id, ...flags[action.id] }))
    .filter((next) => {
      const action = stripeActions.find((candidate) => candidate.id === next.id)!;
      return next.enabled !== action.enabled || next.requires_confirmation !== action.requires_confirmation;
    });
  const emailChanged = emailDraft !== null && emailDraft !== matchByEmail;
  const dirty = emailChanged || changedFlags.length > 0;

  function openConfigure() {
    setEmailDraft(null);
    setFlags({});
    setConfiguring(true);
  }

  async function save() {
    setSaving(true);
    await runAction(() => actionSaveStripe(agentId, { ...(emailChanged && { match_by_email: emailDraft! }), actions: changedFlags }), {
      success: "Saved",
      onSuccess: () => {
        setConfiguring(false);
        router.refresh();
      },
    });
    setSaving(false);
  }

  // Show the result of coming back from Stripe once, then tidy the URL.
  useEffect(() => {
    if (!notice) return;
    NOTICES[notice]?.();
    router.replace(pathname, { scroll: false });
  }, [notice, pathname, router]);

  async function disconnect() {
    setDisconnecting(true);
    await runAction(() => actionDisconnectStripe(agentId), {
      success: "Stripe disconnected",
      onSuccess: () => {
        setConfirmOff(false);
        router.refresh();
      },
    });
    setDisconnecting(false);
  }

  return (
    <div className="mt-10">
      <Card className="flex items-center gap-4 p-5 sm:p-6">
        <StripeLogo />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold">Stripe</h2>
            {connected && (
              <Badge tone={metadata.livemode ? "success" : "warning"}>
                {metadata.livemode ? "Live" : metadata.mode === "sandbox" ? "Sandbox" : "Test mode"}
              </Badge>
            )}
          </div>
          <p className={cn("mt-0.5 text-[13.5px] text-muted", connected ? "truncate" : "text-pretty")}>
            {connected ? (
              <>
                {metadata.account_name ?? "Stripe account"} ·{" "}
                {metadata.connected_via === "key" ? (
                  <>
                    API key <span className="font-mono text-[12px]">…{metadata.key_hint}</span>
                  </>
                ) : (
                  `connected with the ${BRAND.name} app`
                )}
              </>
            ) : (
              `Lets ${assistantName} look up invoices, open the billing portal and change plans for signed-in users. Each user only reaches their own subscription.`
            )}
          </p>
        </div>
        {connected ? (
          <ConfigureButton onClick={openConfigure} />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConnecting(true)}>
            Connect
          </Button>
        )}
      </Card>

      <Sheet open={connecting} onOpenChange={setConnecting}>
        <SheetContent className="max-w-[520px]">
          <SheetHeader
            title="Connect Stripe"
            description={`So ${assistantName} can answer billing questions for signed-in users. Each user only reaches their own subscription.`}
          />
          <SheetBody className="pt-1">
            {appModes.length > 0 ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="w-full bg-[#635bff] hover:bg-[#5851e8] active:bg-[#4f48d6] sm:w-auto">
                    <a href={connectHref(appModes[0])}>
                      <StripeMark className="size-4" /> {appModes[0] === "live" ? "Connect with Stripe" : "Connect a Stripe sandbox"}
                    </a>
                  </Button>
                  {appModes.length > 1 && (
                    <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto">
                      <a href={connectHref("sandbox")}>Connect a sandbox</a>
                    </Button>
                  )}
                </div>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
                    <ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90" />
                    Use a restricted API key instead
                  </summary>
                  <div className="mt-4">
                    <KeyForm agentId={agentId} permissions={permissions} onConnected={() => router.refresh()} />
                  </div>
                </details>
              </div>
            ) : (
              <KeyForm agentId={agentId} permissions={permissions} onConnected={() => router.refresh()} />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={configuring} onOpenChange={setConfiguring}>
        <SheetContent className="max-w-[520px]">
          <SheetHeader title="Stripe" description={metadata.account_name} />
          <SheetBody className="flex flex-col gap-7 pt-1">
            <DrawerSection title="Signed-in users">
              <JobRow
                title="Find customers by email"
                summary={
                  <>
                    For users your site identifies without a <code className="font-mono text-[12px] text-ink-2">stripe_customer_id</code>.
                    Only turn it on if your product verifies email addresses.
                  </>
                }
                checked={emailDraft ?? matchByEmail}
                onCheckedChange={setEmailDraft}
              />
            </DrawerSection>
            <DrawerSection title={`What ${assistantName} can do`}>
              {stripeActions.map((action) => {
                const operation = action.config.operation as StripeOperation | undefined;
                const spec = operation ? STRIPE_OPERATIONS[operation] : undefined;
                const plans = action.config.allowed_prices ?? [];
                const isChangePlan = operation === "change_plan";
                const current = flagsOf(action);
                return (
                  <JobRow
                    key={action.id}
                    title={action.title}
                    summary={spec?.summary ?? action.description}
                    checked={current.enabled}
                    disabled={isChangePlan && plans.length === 0 && !current.enabled}
                    onCheckedChange={(value) => change(action, { enabled: value })}
                  >
                    {isChangePlan && (
                      <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => setPlansFor(action)}>
                        {plans.length === 0 ? "Choose plans first" : `Choose plans (${plans.length} allowed)`}
                      </Button>
                    )}
                    {spec?.mutating && current.enabled && (
                      <ConfirmFirst
                        checked={current.requires_confirmation}
                        onChange={(value) => change(action, { requires_confirmation: value })}
                      />
                    )}
                  </JobRow>
                );
              })}
            </DrawerSection>
          </SheetBody>
          <SheetFooter>
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => {
                setConfiguring(false);
                setConfirmOff(true);
              }}
            >
              Disconnect
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setConfiguring(false)}>
                Cancel
              </Button>
              <Button loading={saving} disabled={!dirty} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent size="sm">
          <DialogHeader
            title="Disconnect Stripe?"
            description={
              metadata.connected_via === "key"
                ? `${assistantName} will stop handling billing questions and changes. You can connect again any time.`
                : `${assistantName} will stop handling billing questions and changes. To remove ${BRAND.name} from Stripe too, uninstall it under Installed apps in your Stripe Dashboard.`
            }
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={disconnecting} onClick={disconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlansDialog agentId={agentId} action={plansFor} onClose={() => setPlansFor(null)} />
    </div>
  );
}

function KeyForm({
  agentId,
  permissions,
  onConnected,
}: {
  agentId: string;
  permissions: { resource: string; access: string }[];
  onConnected: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await runAction(() => actionConnectStripe(agentId, key), {
      success: "Stripe connected",
      onSuccess: () => {
        setKey("");
        onConnected();
      },
    });
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="text-[14px] font-medium">Create a restricted key with these permissions</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {permissions.map((permission) => (
            <li
              key={permission.resource}
              className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-[13.5px] shadow-border"
            >
              {permission.resource}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
                  permission.access === "Write" ? "bg-warning-soft text-warning-ink" : "bg-surface-2 text-ink-2",
                )}
              >
                {permission.access}
              </span>
            </li>
          ))}
        </ul>
        <a
          href="https://dashboard.stripe.com/apikeys"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium text-accent-ink hover:underline"
        >
          Open API keys in Stripe <ArrowUpRight className="size-3.5" />
        </a>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-6">
        <label htmlFor="stripe-key" className="text-[13px] font-medium">
          Restricted key
        </label>
        <Input
          id="stripe-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="rk_live_…"
          className="font-mono text-[13px]"
        />
        <div className="mt-1 flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={!key.trim()}>
            Connect
          </Button>
          <span className="text-[12.5px] text-muted">Stored encrypted.</span>
        </div>
      </form>
    </div>
  );
}
