"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";
import {
  actionConnectIntegration,
  actionDisconnectIntegration,
  actionIntegrationSettings,
  actionPrepareOwnApp,
  actionSaveIntegration,
  actionTestIntegration,
  actionUseIntegrationFor,
} from "@/server-actions/integrations";
import { appUrl, BRAND } from "@/config/brand";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";
import { CAPABILITIES, type Capability } from "@/lib/integrations/capabilities";
import { openUrlFor, providerInfo, type ProviderId, type ProviderInfo, type Step, type TokenField } from "@/lib/integrations/catalog";
import type { Setting } from "@/lib/integrations/providers/types";
import { IntegrationLogo, IntegrationMark, INTEGRATION_BRANDS } from "@/components/brand/integration-logos";
import { CopyButton } from "@/components/dashboard/code-block";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { ConfigureButton, ConfirmFirst, DrawerSection, JobRow } from "./integration-ui";

export type ServiceConnection = { provider: ProviderId; metadata: Record<string, unknown>; config: Record<string, unknown> };
// An action of kind "integration": one capability, handled by one connected service.
export type ServiceAction = {
  id: string;
  enabled: boolean;
  requires_confirmation: boolean;
  config: { capability?: Capability; provider?: ProviderId };
};

// Jobs a visitor could mind, so the owner can have the assistant ask first.
const CONFIRMABLE: Capability[] = ["create_ticket", "save_lead", "book_meeting"];

// What the card says it's doing: the account, then each chosen setting's label.
function summaryOf(connection: ServiceConnection) {
  const account = connection.metadata.account_name as string | undefined;
  const labels = Object.entries(connection.config)
    .filter(([key, value]) => key.endsWith("_label") && typeof value === "string")
    .map(([, value]) => value as string);
  return [account, ...labels].filter(Boolean).join(" · ");
}

const RESULTS: Record<string, (name: string) => void> = {
  connected: (name) => toast.success(`${name} connected`),
  cancelled: (name) => toast(`Connecting to ${name} was cancelled`),
  failed: (name) => toast.error(`Couldn't connect ${name}. Try again.`),
};

export function ServiceCards({
  agentId,
  assistantName,
  providers,
  connections,
  actions,
  oauthReady,
  notice,
}: {
  agentId: string;
  assistantName: string;
  providers: ProviderInfo[];
  connections: ServiceConnection[];
  actions: ServiceAction[];
  oauthReady: Partial<Record<ProviderId, boolean>>;
  notice: { provider: string; result: string } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Show the result of coming back from a service once, then tidy the URL.
  useEffect(() => {
    if (!notice) return;
    const info = providers.find((provider) => provider.id === notice.provider);
    if (info) RESULTS[notice.result]?.(info.name);
    router.replace(pathname, { scroll: false });
  }, [notice, pathname, providers, router]);

  return (
    <div className="mt-4 flex flex-col gap-4">
      {providers.map((info) => (
        <ServiceCard
          key={info.id}
          agentId={agentId}
          assistantName={assistantName}
          info={info}
          connection={connections.find((connection) => connection.provider === info.id) ?? null}
          actions={actions}
          oauthReady={Boolean(oauthReady[info.id])}
        />
      ))}
    </div>
  );
}

function ServiceCard({
  agentId,
  assistantName,
  info,
  connection,
  actions,
  oauthReady,
}: {
  agentId: string;
  assistantName: string;
  info: ProviderInfo;
  connection: ServiceConnection | null;
  actions: ServiceAction[];
  oauthReady: boolean;
}) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const missing = connection && info.needs && !connection.config[info.needs.key] ? info.needs : null;

  async function disconnect() {
    setDisconnecting(true);
    await runAction(() => actionDisconnectIntegration(agentId, info.id), {
      success: `${info.name} disconnected`,
      onSuccess: () => {
        setConfirmOff(false);
        router.refresh();
      },
    });
    setDisconnecting(false);
  }

  return (
    <Card className="flex items-center gap-4 p-5 sm:p-6">
      <IntegrationLogo brand={info.id} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold">{info.name}</h2>
          {connection && (missing ? <Badge tone="warning">{missing.prompt}</Badge> : <Badge tone="success">Connected</Badge>)}
        </div>
        <p className={cn("mt-0.5 text-[13.5px] text-muted", connection ? "truncate" : "text-pretty")}>
          {connection ? summaryOf(connection) : info.description}
        </p>
      </div>
      {connection ? (
        <ConfigureButton onClick={() => setConfiguring(true)} emphasized={Boolean(missing)} />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConnecting(true)}>
          Connect
        </Button>
      )}

      {connection ? (
        <ConfigureSheet
          open={configuring}
          onOpenChange={setConfiguring}
          agentId={agentId}
          assistantName={assistantName}
          info={info}
          connection={connection}
          actions={actions}
          onDisconnect={() => {
            setConfiguring(false);
            setConfirmOff(true);
          }}
        />
      ) : (
        <Sheet open={connecting} onOpenChange={setConnecting}>
          <SheetContent className="max-w-[520px]">
            <SheetHeader title={`Connect ${info.name}`} description={info.description} />
            <SheetBody className="pt-1">
              <ConnectPanel
                agentId={agentId}
                info={info}
                oauthReady={oauthReady}
                onConnected={() => {
                  setConnecting(false);
                  router.refresh();
                }}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent size="sm">
          <DialogHeader
            title={`Disconnect ${info.name}?`}
            description={`${assistantName} stops using ${info.name}. What it handled moves to another connected service that can do it, if there is one. You can connect again any time.`}
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
    </Card>
  );
}

function ConnectPanel({
  agentId,
  info,
  oauthReady,
  onConnected,
}: {
  agentId: string;
  info: ProviderInfo;
  oauthReady: boolean;
  onConnected: () => void;
}) {
  if (info.auth === "token") {
    return <TokenForm agentId={agentId} info={info} fields={info.fields ?? []} steps={info.steps ?? []} onConnected={onConnected} />;
  }
  // Another way in: a key (HubSpot, Calendly) or the customer's own app (Zendesk, Salesforce).
  const alternative = info.tokenFallback ? (
    <TokenForm agentId={agentId} info={info} {...info.tokenFallback} onConnected={onConnected} />
  ) : info.ownApp ? (
    <OwnAppForm agentId={agentId} info={info} />
  ) : null;
  const alternativeLabel = info.tokenFallback
    ? `Use a ${info.tokenFallback.fields[0].label.toLowerCase()} instead`
    : `Use your own ${info.name} app instead`;

  if (!oauthReady) {
    if (alternative) return alternative;
    const prefix = info.id.toUpperCase();
    return (
      <p className="text-[13.5px] text-pretty text-muted">
        Connecting {info.name} needs <code className="font-mono text-[12.5px] text-ink-2">{prefix}_CLIENT_ID</code> and{" "}
        <code className="font-mono text-[12.5px] text-ink-2">{prefix}_CLIENT_SECRET</code> on the server. The README explains how to get
        them.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <OAuthButton agentId={agentId} info={info} />
      {alternative && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
            <ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90" />
            {alternativeLabel}
          </summary>
          <div className="mt-5">{alternative}</div>
        </details>
      )}
    </div>
  );
}

// Numbered instructions; values to paste into the service come with a copy button.
function Steps({ steps, callback }: { steps: Step[]; callback: string }) {
  const fill = (value: string) => value.replaceAll("{callback}", callback).replaceAll("{product}", BRAND.name);
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2 tabular">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5 text-[13.5px] leading-relaxed text-ink-2">
            {typeof step === "string" ? (
              fill(step)
            ) : (
              <>
                {fill(step.text)}
                <dl className="mt-2.5 divide-y divide-line rounded-xl bg-surface-2/60 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]">
                  {step.values.map((item) => {
                    const value = fill(item.value);
                    return (
                      <div key={item.label} className="flex items-start gap-3 px-3 py-2.5">
                        <dt className="w-24 shrink-0 pt-px text-[12.5px] text-muted">{item.label}</dt>
                        <dd
                          className={cn(
                            "min-w-0 flex-1 text-[13px] break-words text-ink",
                            value.startsWith("http") && "font-mono text-[12px]",
                          )}
                        >
                          {value}
                        </dd>
                        {item.copy !== false && <CopyButton value={value} className="-my-1 text-muted hover:bg-surface-3 hover:text-ink" />}
                      </div>
                    );
                  })}
                </dl>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FieldInput({ id, field, value, onChange }: { id: string; field: TokenField; value: string; onChange: (value: string) => void }) {
  const input = (
    <Input
      id={id}
      type={field.secret ? "password" : "text"}
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      className={cn(field.secret && "font-mono text-[13px]")}
      style={field.suffix ? { paddingRight: `${field.suffix.length * 0.5 + 1.25}rem` } : undefined}
    />
  );
  if (!field.suffix) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[14px] text-muted">{field.suffix}</span>
    </div>
  );
}

// The customer's own app (Zendesk, Salesforce): how to create it, its credentials, then off to sign in.
function OwnAppForm({ agentId, info }: { agentId: string; info: ProviderInfo }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fields = info.ownApp?.fields ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await runAction(() => actionPrepareOwnApp(agentId, info.id, values));
    if (result) window.location.href = result.data.url;
    else setSaving(false);
  }

  return (
    <div className="flex flex-col gap-7">
      <Steps steps={info.ownApp?.steps ?? []} callback={appUrl(`/api/integrations/${info.id}/callback`)} />
      <form onSubmit={submit} className="flex flex-col gap-4 border-t border-line pt-6">
        {fields.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={`${info.id}-own-${field.key}`} optional={field.optional} hint={field.hint}>
            <FieldInput
              id={`${info.id}-own-${field.key}`}
              field={field}
              value={values[field.key] ?? ""}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            />
          </Field>
        ))}
        <div className="mt-1 flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={fields.some((field) => !field.optional && !values[field.key]?.trim())}>
            Continue to {info.name}
          </Button>
          <span className="text-[12.5px] text-muted">Stored encrypted.</span>
        </div>
      </form>
    </div>
  );
}

// "Connect with Slack", after what the service needs first (a Salesforce address).
function OAuthButton({ agentId, info }: { agentId: string; info: ProviderInfo }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = info.fields ?? [];
  const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
  const href = `/api/integrations/${info.id}/connect?${new URLSearchParams({ agentId, ...filled })}`;
  const ready = fields.every((field) => field.optional || values[field.key]?.trim());
  const button = (
    <Button
      asChild={ready}
      size="lg"
      disabled={!ready}
      className="w-full text-white sm:w-auto sm:self-start"
      style={{ backgroundColor: INTEGRATION_BRANDS[info.id].color }}
    >
      {ready ? (
        <a href={href}>
          <IntegrationMark brand={info.id} className="size-4" /> Connect with {info.name}
        </a>
      ) : (
        <span>
          <IntegrationMark brand={info.id} className="size-4" /> Connect with {info.name}
        </span>
      )}
    </Button>
  );
  if (fields.length === 0) return button;
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <Field key={field.key} label={field.label} htmlFor={`${info.id}-${field.key}`} optional={field.optional} hint={field.hint}>
          <FieldInput
            id={`${info.id}-${field.key}`}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
          />
        </Field>
      ))}
      {button}
    </div>
  );
}

function TokenForm({
  agentId,
  info,
  fields,
  steps,
  onConnected,
}: {
  agentId: string;
  info: ProviderInfo;
  fields: TokenField[];
  steps: Step[];
  onConnected: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const required = fields.filter((field) => !field.optional);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await runAction(() => actionConnectIntegration(agentId, info.id, values), {
      success: `${info.name} connected`,
      onSuccess: () => {
        setValues({});
        onConnected();
      },
    });
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-7">
      {steps.length > 0 && <Steps steps={steps} callback={appUrl(`/api/integrations/${info.id}/callback`)} />}
      <form onSubmit={submit} className={cn("flex flex-col gap-4", steps.length > 0 && "border-t border-line pt-6")}>
        {fields.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={`${info.id}-${field.key}`} optional={field.optional} hint={field.hint}>
            <FieldInput
              id={`${info.id}-${field.key}`}
              field={field}
              value={values[field.key] ?? ""}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            />
          </Field>
        ))}
        <div className="mt-1 flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={required.some((field) => !values[field.key]?.trim())}>
            Connect
          </Button>
          <span className="text-[12.5px] text-muted">Stored encrypted.</span>
        </div>
      </form>
    </div>
  );
}

type Flags = { enabled: boolean; requires_confirmation: boolean };

// Everything about a connected service: where it is, a test, its settings and
// what the assistant does with it. Changes stay a draft until Save.
function ConfigureSheet({
  open,
  onOpenChange,
  agentId,
  assistantName,
  info,
  connection,
  actions,
  onDisconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  assistantName: string;
  info: ProviderInfo;
  connection: ServiceConnection;
  actions: ServiceAction[];
  onDisconnect: () => void;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Record<string, string | boolean>>({});
  const [flags, setFlags] = useState<Record<string, Flags>>({});
  const connectedAs = connection.metadata.connected_as as string | undefined;
  const account = connection.metadata.account_name as string | undefined;
  const openUrl = openUrlFor(info, connection.metadata);

  // What's saved, so the draft only holds real changes.
  const savedConfig = (key: string) =>
    key === "post_handoffs" ? connection.config.post_handoffs !== false : (connection.config[key] ?? "");
  const configValue = (key: string) => (key in config ? config[key] : savedConfig(key));
  const flagsOf = (action: ServiceAction): Flags =>
    flags[action.id] ?? { enabled: action.enabled, requires_confirmation: action.requires_confirmation };
  const changedConfig = Object.fromEntries(Object.entries(config).filter(([key, value]) => value !== savedConfig(key)));
  const changedFlags = actions
    .filter((action) => flags[action.id])
    .map((action) => ({ id: action.id, ...flags[action.id] }))
    .filter((change) => {
      const action = actions.find((candidate) => candidate.id === change.id)!;
      return change.enabled !== action.enabled || change.requires_confirmation !== action.requires_confirmation;
    });
  const dirty = Object.keys(changedConfig).length > 0 || changedFlags.length > 0;
  const missing = info.needs && !configValue(info.needs.key) ? info.needs : null;

  // A fresh draft each time it opens; the choices come from the service.
  useEffect(() => {
    if (!open) return;
    setConfig({});
    setFlags({});
    let live = true;
    setSettingsError(null);
    actionIntegrationSettings(agentId, info.id).then((result) => {
      if (!live) return;
      if (result.ok) setSettings(result.data.settings);
      else setSettingsError(result.error);
    });
    return () => {
      live = false;
    };
  }, [open, agentId, info.id]);

  const change = (action: ServiceAction, patch: Partial<Flags>) =>
    setFlags((current) => ({ ...current, [action.id]: { ...(current[action.id] ?? flagsOf(action)), ...patch } }));

  async function save() {
    setSaving(true);
    await runAction(() => actionSaveIntegration(agentId, info.id, { config: changedConfig, actions: changedFlags }), {
      success: "Saved",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    });
    setSaving(false);
  }

  async function test() {
    setTesting(true);
    const result = await runAction(() => actionTestIntegration(agentId, info.id));
    if (result) {
      const { note, url } = result.data;
      toast.success(note, url ? { action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") } } : undefined);
    }
    setTesting(false);
  }

  const jobs = info.capabilities.map((capability) => {
    const spec = CAPABILITIES[capability];
    const action = actions.find((candidate) => candidate.config.capability === capability);
    const handledBy = action?.config.provider as ProviderId | undefined;
    if (!action) return null;
    if (handledBy && handledBy !== info.id) {
      return (
        <JobRow
          key={capability}
          title={spec.title}
          summary={`Done in ${providerInfo(handledBy).name} for now.`}
          control={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runAction(() => actionUseIntegrationFor(agentId, capability, info.id), {
                  success: `${spec.title} now uses ${info.name}`,
                  onSuccess: () => router.refresh(),
                })
              }
            >
              Use {info.name}
            </Button>
          }
        />
      );
    }
    const current = flagsOf(action);
    return (
      <JobRow
        key={capability}
        title={info.id === "slack" ? "The team should know" : spec.title}
        summary={info.id === "slack" ? "A hot lead, an upset customer, a bug." : spec.summary}
        checked={current.enabled}
        onCheckedChange={(value) => change(action, { enabled: value })}
      >
        {CONFIRMABLE.includes(capability) && current.enabled && (
          <ConfirmFirst checked={current.requires_confirmation} onChange={(value) => change(action, { requires_confirmation: value })} />
        )}
      </JobRow>
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[520px]">
        <SheetHeader
          title={info.name}
          description={
            [account, connectedAs && connectedAs !== account ? `as ${connectedAs}` : null].filter(Boolean).join(" · ") || undefined
          }
        />
        <SheetBody className="flex flex-col gap-7 pt-1">
          {(openUrl || info.test) && (
            <div className="flex flex-wrap gap-2">
              {openUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={openUrl} target="_blank" rel="noopener">
                    Open {info.name} <ArrowUpRight />
                  </a>
                </Button>
              )}
              {info.test && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={testing}
                  // A test uses what's saved, so unsaved choices wouldn't be what it checks.
                  disabled={Boolean(missing) || dirty}
                  title={dirty ? "Save your changes first" : undefined}
                  onClick={() => void test()}
                >
                  {info.test}
                </Button>
              )}
            </div>
          )}

          {settingsError && <p className="text-[13.5px] text-danger">{settingsError}</p>}
          {!settings && !settingsError && (
            <div className="flex items-center gap-2 text-[13.5px] text-muted">
              <Loader2 className="size-4 animate-spin" /> Loading from {info.name}
            </div>
          )}
          {settings?.map((setting) => (
            <Field key={setting.key} label={setting.label} htmlFor={`${info.id}-${setting.key}`} hint={setting.hint}>
              <Select
                id={`${info.id}-${setting.key}`}
                value={String(configValue(setting.key))}
                onValueChange={(next) => setConfig((current) => ({ ...current, [setting.key]: next }))}
                options={setting.options}
                placeholder={setting.options.length ? "Choose one" : "Nothing to choose yet"}
              />
            </Field>
          ))}

          {info.id === "slack" ? (
            <DrawerSection title="Post to the channel when">
              <JobRow
                title="Someone needs a follow-up"
                summary={`${assistantName} couldn't help, or they asked for a person.`}
                checked={Boolean(configValue("post_handoffs"))}
                onCheckedChange={(value) => setConfig((current) => ({ ...current, post_handoffs: value }))}
              />
              {jobs}
            </DrawerSection>
          ) : (
            <DrawerSection title={`What ${assistantName} does with ${info.name}`}>{jobs}</DrawerSection>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" className="text-danger hover:text-danger" onClick={onDisconnect}>
            Disconnect
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={saving} disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
