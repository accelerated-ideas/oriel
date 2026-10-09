"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, MonitorSmartphone, Plus, X } from "lucide-react";
import { BRAND } from "@/config/brand";
import { actionSaveAction } from "@/server-actions/actions";
import { runAction } from "@/lib/run-action";
import type { ActionParameter } from "@/lib/types";
import { cn, slugifyToolName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SafeAction } from "./tool-row";

type HeaderRow = { key: string; value: string; keep: boolean; preview?: string };

const EMPTY_PARAMETER: ActionParameter = { name: "", type: "string", description: "", required: true };

function toolDefinition(input: {
  name: string;
  description: string;
  parameters: ActionParameter[];
  confirm: boolean;
}) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const parameter of input.parameters) {
    if (!parameter.name) continue;
    properties[parameter.name] = {
      type: parameter.type,
      ...(parameter.description ? { description: parameter.description } : {}),
      ...(parameter.enum?.length ? { enum: parameter.enum } : {}),
    };
    if (parameter.required) required.push(parameter.name);
  }
  if (input.confirm) {
    properties.confirmed = { type: "boolean", description: "true only after the user agreed to this exact action" };
  }
  return { name: input.name || "action_name", description: input.description, parameters: { type: "object", properties, required } };
}

export function ActionEditor({
  agentId,
  action,
  open,
  onClose,
}: {
  agentId: string;
  action: SafeAction | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"http" | "client">("http");
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [parameters, setParameters] = useState<ActionParameter[]>([]);
  const [requiresIdentity, setRequiresIdentity] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [method, setMethod] = useState("POST");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(action?.kind === "client" ? "client" : "http");
    setTitle(action?.title ?? "");
    setName(action?.name ?? "");
    setNameTouched(Boolean(action));
    setDescription(action?.description ?? "");
    setParameters(action?.parameters ?? []);
    setRequiresIdentity(action?.requires_identity ?? false);
    setRequiresConfirmation(action?.requires_confirmation ?? false);
    setMethod((action?.config.method as string) ?? "POST");
    setUrl((action?.config.url as string) ?? "");
    setHeaders((action?.config.headers ?? []).map((header) => ({ key: header.key, value: "", keep: true, preview: header.preview })));
    setBody((action?.config.body as string) ?? "");
  }, [open, action]);

  const definition = useMemo(
    () => toolDefinition({ name, description, parameters, confirm: requiresConfirmation }),
    [name, description, parameters, requiresConfirmation],
  );

  const updateParameter = (index: number, patch: Partial<ActionParameter>) =>
    setParameters((current) => current.map((parameter, i) => (i === index ? { ...parameter, ...patch } : parameter)));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await runAction(
      () =>
        actionSaveAction(agentId, {
          id: action?.id ?? null,
          kind,
          name,
          title,
          description,
          requires_confirmation: requiresConfirmation,
          requires_identity: requiresIdentity,
          parameters: parameters.filter((parameter) => parameter.name.trim()),
          http: kind === "http" ? { method: method as "POST", url, headers, body } : null,
        }),
      {
        success: action ? "Action updated" : "Action created",
        onSuccess: () => {
          onClose();
          router.refresh();
        },
      },
    );
    setSaving(false);
  }

  const registerSnippet = `${BRAND.embedGlobal}("registerAction", "${name || "action_name"}", async ({ ${
    parameters.map((parameter) => parameter.name).filter(Boolean).join(", ") || "...args"
  } }) => {\n  // Do the work with your app's own code and session.\n  return "Done";\n});`;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent size="xl">
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader
            title={action ? "Edit action" : "New action"}
            description="The model reads the name, description and parameters to decide when to use it and what to pass."
          />
          <DialogBody className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-6">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where it runs">
                {(
                  [
                    { value: "http", icon: Globe, title: "Call your API", text: "We send an HTTP request from our servers." },
                    { value: "client", icon: MonitorSmartphone, title: "Run in the page", text: "A function you register on your site runs it." },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === option.value}
                    onClick={() => setKind(option.value)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors",
                      kind === option.value ? "border-ink bg-surface-2" : "border-line hover:border-line-strong",
                    )}
                  >
                    <option.icon className="size-4 text-ink-2" />
                    <span className="mt-1 text-[14px] font-semibold">{option.title}</span>
                    <span className="text-[12.5px] leading-snug text-muted">{option.text}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Title" htmlFor="action-title">
                  <Input
                    id="action-title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (!nameTouched) setName(slugifyToolName(e.target.value));
                    }}
                    placeholder="Create campaign"
                  />
                </Field>
                <Field label="Tool name" htmlFor="action-name">
                  <Input
                    id="action-name"
                    value={name}
                    onChange={(e) => {
                      setNameTouched(true);
                      setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
                    }}
                    placeholder="create_campaign"
                    className="font-mono text-[13px]"
                  />
                </Field>
              </div>

              <Field label="When should it use this?" htmlFor="action-description" hint="Be specific. Mention what it does, when to use it, and what to say about the result.">
                <Textarea
                  id="action-description"
                  minRows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Creates a new email campaign in the user's workspace. Use it when they ask to start a campaign. Ask for the name if they didn't give one."
                />
              </Field>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label>Parameters</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setParameters((current) => [...current, { ...EMPTY_PARAMETER }])}>
                    <Plus /> Add
                  </Button>
                </div>
                {parameters.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-muted">
                    No inputs. Add one for anything the model should fill in, like a name or an amount.
                  </p>
                ) : (
                  parameters.map((parameter, index) => (
                    <div key={index} className="flex flex-col gap-2 rounded-xl bg-surface p-3 shadow-border">
                      <div className="flex items-center gap-2">
                        <Input
                          value={parameter.name}
                          onChange={(e) => updateParameter(index, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                          placeholder="campaign_name"
                          className="h-9 flex-1 font-mono text-[13px]"
                          aria-label="Parameter name"
                        />
                        <Select
                          value={parameter.type}
                          onValueChange={(value) => updateParameter(index, { type: value as ActionParameter["type"] })}
                          options={[
                            { value: "string", label: "Text" },
                            { value: "number", label: "Number" },
                            { value: "boolean", label: "Yes / no" },
                          ]}
                          className="h-9 w-28"
                        />
                        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                          <Switch checked={parameter.required} onCheckedChange={(value) => updateParameter(index, { required: value })} />
                          Required
                        </label>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setParameters((current) => current.filter((_, i) => i !== index))}
                          aria-label="Remove parameter"
                        >
                          <X />
                        </Button>
                      </div>
                      <Input
                        value={parameter.description}
                        onChange={(e) => updateParameter(index, { description: e.target.value })}
                        placeholder="What it is, e.g. The name the user gave the campaign"
                        className="h-9 text-[13px]"
                        aria-label="Parameter description"
                      />
                      {parameter.type === "string" && (
                        <Input
                          value={parameter.enum?.join(", ") ?? ""}
                          onChange={(e) =>
                            updateParameter(index, {
                              enum: e.target.value ? e.target.value.split(",").map((value) => value.trim()) : undefined,
                            })
                          }
                          placeholder="Allowed values (optional, comma separated)"
                          className="h-9 text-[13px]"
                          aria-label="Allowed values"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>

              {kind === "http" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Select
                      value={method}
                      onValueChange={setMethod}
                      options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ value, label: value }))}
                      className="w-28"
                    />
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://api.acme.com/campaigns?owner={{user.id}}"
                      className="flex-1 font-mono text-[13px]"
                      aria-label="URL"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Headers</Label>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setHeaders((current) => [...current, { key: "", value: "", keep: false }])}>
                        <Plus /> Add
                      </Button>
                    </div>
                    {headers.map((header, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={header.key}
                          onChange={(e) =>
                            setHeaders((current) => current.map((row, i) => (i === index ? { ...row, key: e.target.value } : row)))
                          }
                          placeholder="Authorization"
                          className="h-9 w-40 font-mono text-[13px]"
                          aria-label="Header name"
                        />
                        <Input
                          type="password"
                          value={header.value}
                          onChange={(e) =>
                            setHeaders((current) =>
                              current.map((row, i) => (i === index ? { ...row, value: e.target.value, keep: false } : row)),
                            )
                          }
                          placeholder={header.keep ? `${header.preview} (unchanged)` : "Bearer sk_…"}
                          className="h-9 flex-1 font-mono text-[13px]"
                          aria-label="Header value"
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setHeaders((current) => current.filter((_, i) => i !== index))}
                          aria-label="Remove header"
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {method !== "GET" && method !== "DELETE" && (
                    <Field
                      label="Body"
                      htmlFor="action-body"
                      hint={
                        <>
                          JSON. Use <code className="font-mono">{"{{parameter}}"}</code>,{" "}
                          <code className="font-mono">{"{{user.id}}"}</code> or <code className="font-mono">{"{{user.email}}"}</code>.
                          Header values are stored encrypted.
                        </>
                      }
                    >
                      <Textarea
                        id="action-body"
                        minRows={4}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder={'{\n  "name": "{{campaign_name}}",\n  "owner_email": "{{user.email}}"\n}'}
                        className="font-mono text-[12.5px]"
                      />
                    </Field>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label>Register it on your site</Label>
                  <pre className="overflow-x-auto rounded-xl bg-ink p-4 font-mono text-[12px] leading-relaxed text-white/90">
                    {registerSnippet}
                  </pre>
                  <p className="text-[12.5px] text-muted">It runs in the visitor’s browser, with their session on your site.</p>
                </div>
              )}

              <div className="flex flex-col gap-4 rounded-xl bg-surface-2 p-4">
                <label className="flex items-start justify-between gap-4">
                  <span className="text-[14px]">
                    <span className="font-medium">Only for signed-in users</span>
                    <span className="block text-[13px] text-muted">Requires a verified user from your site.</span>
                  </span>
                  <Switch checked={requiresIdentity} onCheckedChange={setRequiresIdentity} />
                </label>
                <label className="flex items-start justify-between gap-4">
                  <span className="text-[14px]">
                    <span className="font-medium">Ask to confirm first</span>
                    <span className="block text-[13px] text-muted">It describes what will happen and waits for a clear yes.</span>
                  </span>
                  <Switch checked={requiresConfirmation} onCheckedChange={setRequiresConfirmation} />
                </label>
              </div>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
              <p className="text-[13px] font-semibold">What the model sees</p>
              <pre className="mt-2 max-h-[520px] overflow-auto rounded-xl border border-line bg-surface-2 p-4 font-mono text-[11.5px] leading-relaxed text-ink-2 scrollbar-thin">
                {JSON.stringify(definition, null, 2)}
              </pre>
            </aside>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!title.trim() || !name.trim() || !description.trim()}>
              {action ? "Save" : "Create action"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
