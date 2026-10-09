import { Globe, MonitorSmartphone } from "lucide-react";
import type { Action, StripeOperation } from "@/lib/types";
import { Badge } from "@/components/ui/misc";

// Shared by Actions and Integrations: one row per tool the model can call.

export type SafeAction = Omit<Action, "config"> & {
  config: {
    method?: string;
    url?: string;
    body?: string;
    operation?: StripeOperation;
    allowed_prices?: { price_id: string; label: string }[];
    headers: { key: string; preview: string }[];
  };
};

export function WhereBadge({ where }: { where: "page" | "server" | "api" }) {
  if (where === "page")
    return (
      <Badge tone="outline">
        <MonitorSmartphone /> In the page
      </Badge>
    );
  if (where === "api")
    return (
      <Badge tone="outline">
        <Globe /> Your API
      </Badge>
    );
  return null;
}

export function ToolRow({
  icon: Icon,
  title,
  tool,
  description,
  badges,
  parameters,
  control,
  menu,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tool: string;
  description: string;
  badges?: React.ReactNode;
  parameters?: { name: string; required: boolean }[];
  control: React.ReactNode;
  menu?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-4 px-5 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
        <Icon className="size-4" />
      </div>
      <div className={muted ? "min-w-0 flex-1 opacity-55" : "min-w-0 flex-1"}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-[14.5px] font-semibold">{title}</p>
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{tool}</code>
          {badges}
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{description}</p>
        {parameters && parameters.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {parameters.map((parameter) => (
              <span key={parameter.name} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">
                {parameter.name}
                {parameter.required ? "" : "?"}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1.5 pt-0.5">
        {menu}
        {control}
      </div>
    </div>
  );
}
