import "server-only";
import type { Capability } from "../capabilities";
import type { ProviderId } from "../catalog";
import type { Connection } from "../store";

// What connecting produces: tokens to keep encrypted, what the service told us
// about the account, and settings to start with.
export type Connected = {
  secret: Connection["secret"];
  metadata: Connection["metadata"];
  config?: Connection["config"];
};

// Who and where, for a capability run during a conversation.
export type RunContext = {
  connection: Connection;
  input: Record<string, unknown>;
  user: { name: string | null; email: string | null; verified: boolean; timeZone: string | null };
  conversation: { id: string; pageUrl: string | null; transcriptUrl: string; assistantName: string };
};

// Choices for the settings on the Integrations page (channels, event types…).
export type SettingOption = { value: string; label: string };
export type Setting = {
  key: string;
  label: string;
  hint?: string;
  options: SettingOption[];
  // Settings that only apply to one capability (e.g. the ticket pipeline).
  capability?: Capability;
};

export type ProviderAdapter = {
  id: ProviderId;
  // OAuth: the server's app credentials are set (for the Connect button).
  oauthConfigured?: () => boolean;
  // `extra`: what the owner entered before connecting (a Salesforce address).
  // It returns as the connect error to show, or undefined when it's fine.
  checkExtra?: (extra: Record<string, string>) => string | undefined;
  // `existing`: the assistant's current connection to the service, if any; a
  // pending one holds the customer's own app credentials (Zendesk, Salesforce).
  authorizeUrl?: (state: string, redirectUri: string, extra: Record<string, string>, existing: Connection | null) => string;
  // `state` is the signed state sent to the service (PKCE derives from it).
  exchangeCode?: (
    code: string,
    redirectUri: string,
    extra: Record<string, string>,
    state: string,
    existing: Connection | null,
  ) => Promise<Connected>;
  // The customer's own app: checks where it lives (a Zendesk subdomain, a
  // Salesforce address) and returns it as metadata for the pending connection.
  // Throws with what to fix.
  prepareOwnApp?: (values: Record<string, string>) => Connection["metadata"];
  // Token: checks what the owner pasted and turns it into a connection.
  connectWithToken?: (values: Record<string, string>) => Promise<Connected>;
  // Settings the owner picks after connecting, loaded from the service.
  settings?: (connection: Connection) => Promise<Setting[]>;
  run: (capability: Capability, context: RunContext) => Promise<unknown>;
  // Best effort: tells the service we no longer use the access.
  revoke?: (connection: Connection) => Promise<void>;
  // Does something harmless and visible in the service (a test message or
  // ticket), so the owner can check the connection works end to end.
  test?: (connection: Connection, context: { assistantName: string }) => Promise<{ note: string; url?: string }>;
  // Refreshes the tokens now, for services whose refresh tokens expire unused.
  keepAlive?: (connection: Connection) => Promise<void>;
};
