"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { actionCreateAgent } from "@/server-actions/agents";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function NewAgentButton({ organizationId, defaultOpen }: { organizationId: string; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [assistantName, setAssistantName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [importSite, setImportSite] = useState(true);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    await runAction(() => actionCreateAgent({ organizationId, assistantName, siteUrl, importSite }), {
      onSuccess: (result) => {
        setOpen(false);
        router.push(`/account/${organizationId}/agents/${result.data.id}/${siteUrl ? "knowledge" : "behavior"}`);
      },
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New assistant
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="New assistant" description="You can change all of this later." />
          <DialogBody className="flex flex-col gap-5">
            <Field label="Assistant name" htmlFor="agent-name" hint="What it calls itself when it talks to your visitors.">
              <Input
                id="agent-name"
                autoFocus
                required
                maxLength={40}
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="Ava"
              />
            </Field>
            <Field label="Website" htmlFor="agent-site" optional hint="Used for knowledge and as an allowed domain.">
              <Input id="agent-site" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="acme.com" />
            </Field>
            {siteUrl.trim() && (
              <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
                <span className="text-[14px]">
                  <span className="font-medium">Read my website</span>
                  <span className="block text-[13px] text-muted">Imports up to 15 pages into knowledge.</span>
                </span>
                <Switch checked={importSite} onCheckedChange={setImportSite} />
              </label>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!assistantName.trim()}>
              Create assistant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
