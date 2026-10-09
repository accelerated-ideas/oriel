import type { AvatarStyle } from "@/config/avatars";

export type OrganizationRole = "owner" | "admin" | "member";

export type BuiltinToolKey = "navigate" | "highlight" | "search_knowledge" | "capture_feedback" | "escalate";

export type Agent = {
  id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  // The name people hear. The product name is optional ("" when unset).
  assistant_name: string;
  site_name: string;
  site_url: string;
  greeting: string;
  instructions: string;
  language: string;
  voice_id: string;
  accent_color: string;
  avatar_style: AvatarStyle;
  launcher_label: string;
  launcher_position: "left" | "center" | "right";
  show_branding: boolean;
  text_mode_enabled: boolean;
  share_page_content: boolean;
  feedback_interviews_enabled: boolean;
  builtin_tools: Partial<Record<BuiltinToolKey, boolean>>;
  handoff_email: string | null;
  handoff_webhook_url: string | null;
  allowed_origins: string[];
  identity_secret: string;
  is_live: boolean;
  // Ids from CHAT_MODELS (src/config/ai.ts). No fallback when null.
  chat_model: string;
  fallback_model: string | null;
};

export type KnowledgeSource = {
  id: string;
  agent_id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  kind: "text" | "file" | "url";
  title: string;
  url: string | null;
  file_name: string | null;
  mime_type: string | null;
  content: string;
  char_count: number;
  chunk_count: number;
  status: "pending" | "processing" | "ready" | "error";
  error: string | null;
  import_id: string | null;
  content_hash: string | null;
  fetched_at: string | null;
  // Read with a browser: the page only had content after its JavaScript ran.
  rendered: boolean;
  // In every prompt, whatever the question.
  always_include: boolean;
};

export type KnowledgeImport = {
  id: string;
  url: string;
  mode: "crawl" | "sitemap";
  // "found": waiting for the owner to choose which pages to add.
  status: "finding" | "found" | "reading" | "done" | "failed" | "canceled";
  page_limit: number;
  pages_found: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  ready: number;
  failed: number;
  waiting: number;
  // Found pages not added (yet).
  unchosen: number;
};

export type SitePage = {
  id: string;
  agent_id: string;
  organization_id: string;
  created_at: string;
  title: string;
  path: string;
  description: string;
  requires_auth: boolean;
};

export type ActionParameterType = "string" | "number" | "boolean";

export type ActionParameter = {
  name: string;
  type: ActionParameterType;
  description: string;
  required: boolean;
  enum?: string[];
};

export type HttpActionConfig = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  // Values are encrypted at rest; only a short preview is ever shown.
  headers: { key: string; value_encrypted?: string; preview?: string }[];
  body: string;
};

export type StripeOperation =
  | "billing_overview"
  | "list_invoices"
  | "cancel_subscription"
  | "resume_subscription"
  | "change_plan"
  | "billing_portal_link";

export type StripeActionConfig = {
  operation: StripeOperation;
  // change_plan only: prices the assistant may switch a customer to.
  allowed_prices?: { price_id: string; label: string }[];
};

export type Action = {
  id: string;
  agent_id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  kind: "http" | "client" | "stripe" | "integration";
  name: string;
  title: string;
  description: string;
  enabled: boolean;
  requires_confirmation: boolean;
  requires_identity: boolean;
  parameters: ActionParameter[];
  config: Partial<HttpActionConfig> & Partial<StripeActionConfig> & Record<string, unknown>;
};

export type Integration = {
  id: string;
  agent_id: string;
  provider: "stripe";
  secret_encrypted: string;
  metadata: { account_name?: string; account_id?: string; livemode?: boolean; key_hint?: string };
  // What the owner chose, e.g. match_by_email for Stripe.
  config: Record<string, unknown>;
  created_at: string;
};

export type PageLink = { text: string; url: string };

export type Conversation = {
  id: string;
  agent_id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  ended_at: string | null;
  status: "active" | "ended";
  used_voice: boolean;
  used_text: boolean;
  voice_seconds: number;
  message_count: number;
  visitor_id: string;
  user_external_id: string | null;
  user_email: string | null;
  user_name: string | null;
  user_verified: boolean;
  user_attributes: Record<string, unknown>;
  stripe_customer_id: string | null;
  host_origin: string | null;
  page_url: string | null;
  page_title: string | null;
  page_text: string | null;
  // Where the links on that page go (only when the assistant reads the page).
  page_links: PageLink[] | null;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
  // The visitor's IANA time zone, from their browser.
  time_zone: string | null;
  title: string | null;
  summary: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  resolved: boolean | null;
  // A team member trying the assistant from the dashboard (the Playground), not a visitor.
  is_preview: boolean;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  created_at: string;
  role: "user" | "assistant" | "tool" | "event";
  content: string;
  channel: "voice" | "text" | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: unknown;
  tool_target: "server" | "client" | null;
  provider_metadata: Record<string, unknown> | null;
  page_url: string | null;
  // Visitor messages only: false when the assistant closed the conversation in reply, which isn't billed.
  billable: boolean;
};

export type InsightType =
  | "bug"
  | "feature_request"
  | "confusion"
  | "complaint"
  | "praise"
  | "churn_risk"
  | "handoff"
  | "other";

export type Insight = {
  id: string;
  agent_id: string;
  conversation_id: string | null;
  created_at: string;
  type: InsightType;
  title: string;
  details: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  page_url: string | null;
  user_email: string | null;
};

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };
