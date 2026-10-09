import type { Capability } from "./capabilities";

// The services an assistant can connect to, for the Integrations page and the
// server. Safe to import in the browser: no secrets, no server code.

export type ProviderId = "slack" | "zendesk" | "salesforce" | "hubspot" | "calcom" | "calendly";

// A value the owner pastes in to connect (when a service has no OAuth for us).
export type TokenField = {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  secret?: boolean;
  optional?: boolean;
  // Shown after the input, like ".zendesk.com".
  suffix?: string;
};

// An instruction for connecting, optionally with values to paste into the
// service, each with a copy button. "{callback}" and "{product}" are filled in.
export type Step = string | { text: string; values: { label: string; value: string; copy?: boolean }[] };

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  // One line on what it lets the assistant do.
  description: string;
  capabilities: Capability[];
  // "oauth": a Connect button (needs the server's client ID and secret), after
  // `fields` when the service needs something first (a Salesforce address).
  // "token": a form with `fields`, with `steps` for where to find them.
  auth: "oauth" | "token";
  fields?: TokenField[];
  steps?: Step[];
  // OAuth services that also take a token, for when the server has no OAuth app.
  tokenFallback?: { fields: TokenField[]; steps: Step[] };
  // OAuth with the customer's own app (Zendesk always, Salesforce without
  // ours): they paste its credentials, then connect.
  ownApp?: { fields: TokenField[]; steps: Step[] };
  // A setting it can't work without, and what to ask for while it's unset.
  needs?: { key: string; prompt: string };
  // The connected account in the service itself; {key} is filled from what
  // connecting stored (plain data: this travels to the browser).
  openUrl?: string;
  // The button that checks the connection end to end (the adapter's `test`).
  test?: string;
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Posts to a channel when the team should step in: a hot lead, an upset customer, someone who needs a follow-up.",
    capabilities: ["notify_team"],
    auth: "oauth",
    needs: { key: "channel", prompt: "Choose a channel" },
    openUrl: "https://app.slack.com/client/{team_id}",
    test: "Send a test message",
  },
  {
    id: "zendesk",
    name: "Zendesk",
    description: "Opens support tickets for visitors, so your team follows up by email.",
    capabilities: ["create_ticket"],
    auth: "oauth",
    ownApp: {
      fields: [
        { key: "subdomain", label: "Zendesk address", placeholder: "yourcompany", suffix: ".zendesk.com" },
        { key: "client_id", label: "Identifier" },
        { key: "client_secret", label: "Secret", secret: true },
      ],
      steps: [
        "As a Zendesk admin, open Admin Center, then Apps and integrations, then APIs, then OAuth clients, and press Add OAuth client.",
        {
          text: "Fill it in like this, and leave allowed scopes empty:",
          values: [
            { label: "Name", value: "{product}" },
            {
              label: "Description",
              value: "Lets the {product} AI assistant on our website open support tickets for visitors who need a reply from our team.",
            },
            { label: "Client kind", value: "Confidential", copy: false },
            { label: "Redirect URL", value: "{callback}" },
          ],
        },
        "Save, then copy the identifier and the secret. Zendesk shows the secret only once.",
      ],
    },
    openUrl: "https://{subdomain}.zendesk.com/agent",
    test: "Create a test ticket",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Opens cases for support questions and saves leads from sales conversations.",
    capabilities: ["create_ticket", "save_lead"],
    auth: "oauth",
    fields: [
      {
        key: "login_url",
        label: "Salesforce address",
        placeholder: "https://yourcompany.my.salesforce.com",
        hint: "Leave it empty to sign in at login.salesforce.com.",
        optional: true,
      },
    ],
    ownApp: {
      fields: [
        {
          key: "login_url",
          label: "Salesforce address",
          placeholder: "https://yourcompany.my.salesforce.com",
          hint: "The address you sign in at, or any Salesforce page's address from your browser.",
        },
        { key: "client_id", label: "Consumer key" },
        { key: "client_secret", label: "Consumer secret", secret: true },
      ],
      steps: [
        "As a Salesforce admin, open Setup, search for External Client App Manager, and press New External Client App.",
        {
          text: "Fill in the basics, with your own email as the contact:",
          values: [
            { label: "Name", value: "{product}" },
            { label: "Distribution", value: "Local", copy: false },
          ],
        },
        {
          text: "Under API, turn on Enable OAuth and set:",
          values: [
            { label: "Callback URL", value: "{callback}" },
            {
              label: "OAuth scopes",
              value: "Manage user data via APIs (api) and Perform requests at any time (refresh_token, offline_access)",
              copy: false,
            },
          ],
        },
        "Leave the security options as they are (secret and PKCE required) and create the app.",
        "In the app's Settings, open OAuth Settings and press Consumer Key and Secret. Salesforce emails you a code first. A new app can take a few minutes to start working.",
      ],
    },
    openUrl: "{instance_url}/lightning/page/home",
    test: "Create a test case",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Opens tickets and saves contacts, linked to the person in your CRM.",
    capabilities: ["create_ticket", "save_lead"],
    auth: "oauth",
    tokenFallback: {
      fields: [{ key: "access_token", label: "Service key", secret: true }],
      steps: [
        "In HubSpot, open Settings, then Integrations, then Service Keys, and create a key. It takes someone with Developer Tools access.",
        {
          text: "Name it and give it these scopes:",
          values: [
            { label: "Name", value: "{product}" },
            {
              label: "Scopes",
              value: "crm.objects.contacts.read, crm.objects.contacts.write, crm.objects.tickets.read, crm.objects.tickets.write, crm.schemas.tickets.read",
            },
          ],
        },
        "Create it, copy the key and paste it here.",
      ],
    },
    openUrl: "https://{ui_domain}/contacts/{hub_id}/objects/0-5/views/all/list",
    test: "Create a test ticket",
  },
  {
    id: "calcom",
    name: "Cal.com",
    description: "Finds open times and books meetings during the conversation.",
    capabilities: ["find_meeting_times", "book_meeting"],
    auth: "oauth",
    // Also how self-hosted Cal.com connects, since our OAuth client is on cal.com.
    tokenFallback: {
      fields: [
        { key: "api_key", label: "API key", placeholder: "cal_live_…", secret: true },
        { key: "api_url", label: "API address", placeholder: "https://api.cal.com/v2", hint: "Only for self-hosted Cal.com.", optional: true },
      ],
      steps: [
        "In Cal.com, open Settings and find API keys, then press New API key.",
        {
          text: "Fill it in like this. A key that expires would stop the assistant booking when it does:",
          values: [
            { label: "Name", value: "{product}" },
            { label: "Expires", value: "Never expires", copy: false },
          ],
        },
        "Copy the key and paste it here.",
      ],
    },
    openUrl: "{app_url}/bookings/upcoming",
    test: "Check open times",
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Finds open times and books meetings during the conversation. Booking needs a paid Calendly plan; otherwise visitors get a link to the time they picked.",
    capabilities: ["find_meeting_times", "book_meeting"],
    auth: "oauth",
    tokenFallback: {
      fields: [{ key: "access_token", label: "Personal access token", secret: true }],
      steps: [
        "In Calendly, open Integrations & apps, then API and webhooks, and generate a personal access token.",
        { text: "Name it:", values: [{ label: "Name", value: "{product}" }] },
        "Copy the token and paste it here. Calendly shows it only once.",
      ],
    },
    openUrl: "https://calendly.com/app/scheduled_events/user/me",
    test: "Check open times",
  },
];

// The service's own page for a connection, or null when something's missing.
export function openUrlFor(info: ProviderInfo, metadata: Record<string, unknown>) {
  if (!info.openUrl) return null;
  let missing = false;
  const url = info.openUrl.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = metadata[key];
    if (typeof value !== "string" || !value) missing = true;
    return /^https:\/\//.test(String(value)) ? String(value) : encodeURIComponent(String(value ?? ""));
  });
  return missing ? null : url;
}

export function providerInfo(id: ProviderId) {
  return PROVIDERS.find((provider) => provider.id === id)!;
}

export function isProviderId(value: unknown): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}
