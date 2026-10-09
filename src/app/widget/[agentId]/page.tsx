import type { Metadata } from "next";
import { WidgetApp } from "@/components/widget/widget-app";
import { normalizeOrigin } from "@/lib/utils";

export const metadata: Metadata = { title: "Assistant", robots: { index: false } };

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ origin?: string; inline?: string }>;
}) {
  const { agentId } = await params;
  const { origin, inline } = await searchParams;
  return <WidgetApp agentId={agentId} hostOrigin={origin ? normalizeOrigin(origin) : null} inline={inline === "1"} />;
}
