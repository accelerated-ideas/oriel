import "server-only";
import type { ProviderId } from "../catalog";
import { calcomAdapter } from "./calcom";
import { calendlyAdapter } from "./calendly";
import { hubspotAdapter } from "./hubspot";
import { salesforceAdapter } from "./salesforce";
import { slackAdapter } from "./slack";
import type { ProviderAdapter } from "./types";
import { zendeskAdapter } from "./zendesk";

// Every service the assistant can connect to, by ID.
const ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  slack: slackAdapter,
  zendesk: zendeskAdapter,
  salesforce: salesforceAdapter,
  hubspot: hubspotAdapter,
  calcom: calcomAdapter,
  calendly: calendlyAdapter,
};

// Services with an adapter, and whether each has its OAuth app set up here.
export function availableProviders() {
  return (Object.keys(ADAPTERS) as ProviderId[]).map((id) => ({ id, oauthReady: Boolean(ADAPTERS[id]!.oauthConfigured?.()) }));
}

export function adapterFor(id: ProviderId) {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`${id} isn't available yet.`);
  return adapter;
}
