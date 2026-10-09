"use client";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

// Pieces shared by the integration cards and their Configure drawers.

export function ConfigureButton({ onClick, emphasized }: { onClick: () => void; emphasized?: boolean }) {
  return (
    <Button size="sm" variant={emphasized ? "primary" : "outline"} onClick={onClick}>
      <Settings2 /> Configure
    </Button>
  );
}

export function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <div className="mt-1 flex flex-col divide-y divide-line">{children}</div>
    </section>
  );
}

// Something the assistant does, on or off, with room under it for a second choice.
export function JobRow({
  title,
  summary,
  checked,
  onCheckedChange,
  disabled,
  control,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  disabled?: boolean;
  // In place of the switch, e.g. a button to move the job to this service.
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3.5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">{title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{summary}</p>
        </div>
        {control ?? (
          <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={title} className="mt-0.5" />
        )}
      </div>
      {children}
    </div>
  );
}

export function ConfirmFirst({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="mt-1.5 -ml-2 flex items-center text-[13px] text-ink-2">
      <Checkbox state={checked ? "on" : "off"} label="Ask the visitor to confirm first" onClick={() => onChange(!checked)} />
      <span className="cursor-pointer select-none" onClick={() => onChange(!checked)}>
        Ask the visitor to confirm first
      </span>
    </div>
  );
}
