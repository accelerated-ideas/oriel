import "server-only";
import { BRAND } from "@/config/brand";
import { callProvider, type Connection } from "../store";
import type { ProviderAdapter, RunContext, Setting } from "./types";

// Slack: an app installed with OAuth (v2) posts to a channel the owner picks.
// Bot tokens don't expire (token rotation stays off). The app is described in
// integrations/slack-app-manifest.yml for creating it in one step.
//   chat:write, chat:write.public  post, also to public channels it hasn't joined
//   channels:read, groups:read     list channels for the picker (private ones
//                                  only after someone invites the app)

const SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read"];
const API = "https://slack.com/api";

type SlackResponse = { ok: boolean; error?: string };

const ERRORS: Record<string, string> = {
  not_in_channel: "The Slack app isn't in that channel. Invite it there, or pick another channel.",
  channel_not_found: "The Slack channel no longer exists. Pick another one on the Integrations page.",
  is_archived: "The Slack channel is archived. Pick another one on the Integrations page.",
  invalid_auth: "Slack no longer accepts the connection. Connect Slack again.",
  token_revoked: "Slack access was removed. Connect Slack again.",
  account_inactive: "Slack access was removed. Connect Slack again.",
};

async function slack<T extends SlackResponse>(method: string, token: string, body?: Record<string, unknown>) {
  const result = await callProvider<T>(`${API}/${method}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body && { "content-type": "application/json; charset=utf-8" }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!result.ok) throw new Error(ERRORS[result.error ?? ""] ?? `Slack said: ${result.error}`);
  return result;
}

// Slack's markup treats &, < and > specially.
export const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A message to the team's channel, with who and where it came from.
export async function postToSlack(
  connection: Connection,
  { title, body, details }: { title: string; body: string; details: (string | null)[] },
) {
  const channel = String(connection.config.channel ?? "");
  if (!channel) throw new Error("No Slack channel is chosen yet. Pick one on the Integrations page.");
  const context = details.filter((line): line is string => Boolean(line));
  await slack("chat.postMessage", String(connection.secret.access_token), {
    channel,
    text: `${title}: ${body}`.slice(0, 3900),
    unfurl_links: false,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${escape(title)}*\n${escape(body).slice(0, 2900)}` } },
      ...(context.length > 0 ? [{ type: "context", elements: [{ type: "mrkdwn", text: context.join("  ·  ").slice(0, 2900) }] }] : []),
    ],
  });
}

function visitorLine(context: RunContext) {
  const { name, email, verified } = context.user;
  if (!name && !email) return "Anonymous visitor";
  return `${escape(name ?? "Visitor")}${email ? ` (${escape(email)}${verified ? ", signed in" : ""})` : ""}`;
}

export const slackAdapter: ProviderAdapter = {
  id: "slack",
  oauthConfigured: () => Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const result = await callProvider<
      SlackResponse & {
        access_token: string;
        bot_user_id?: string;
        app_id?: string;
        team?: { id: string; name: string } | null;
        is_enterprise_install?: boolean;
      }
    >(`${API}/oauth.v2.access`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        redirect_uri: redirectUri,
      }),
    });
    if (!result.ok) throw new Error(`Slack said: ${result.error}`);
    // An Enterprise Grid admin can install for the whole organization; channels
    // then belong to no single workspace, so ask for a workspace install.
    if (result.is_enterprise_install || !result.team) {
      throw new Error("Install Oriel to one Slack workspace, not the whole organization.");
    }
    return {
      secret: { access_token: result.access_token },
      metadata: { account_name: result.team?.name, team_id: result.team?.id, bot_user_id: result.bot_user_id, app_id: result.app_id },
      // Follow-up requests go to Slack too, once a channel is picked.
      config: { post_handoffs: true },
    };
  },

  async settings(connection): Promise<Setting[]> {
    const channels: { id: string; name: string; is_private: boolean }[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({ types: "public_channel,private_channel", exclude_archived: "true", limit: "200" });
      if (cursor) query.set("cursor", cursor);
      const result = await slack<SlackResponse & { channels: typeof channels; response_metadata?: { next_cursor?: string } }>(
        `conversations.list?${query}`,
        String(connection.secret.access_token),
      );
      channels.push(...result.channels);
      cursor = result.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
    channels.sort((a, b) => a.name.localeCompare(b.name));
    return [
      {
        key: "channel",
        label: "Channel",
        hint: "Private channels show up after you invite the app to them in Slack.",
        options: channels.map((channel) => ({ value: channel.id, label: `#${channel.name}${channel.is_private ? " (private)" : ""}` })),
      },
    ];
  },

  async run(capability, context) {
    if (capability !== "notify_team") throw new Error(`Slack can't ${capability}.`);
    const urgency = String(context.input.urgency ?? "normal");
    await postToSlack(context.connection, {
      title: `${urgency === "high" ? "Urgent: " : ""}${context.conversation.assistantName} needs the team`,
      body: String(context.input.message ?? ""),
      details: [
        visitorLine(context),
        context.conversation.pageUrl ? `<${context.conversation.pageUrl}|Page they're on>` : null,
        `<${context.conversation.transcriptUrl}|Open the conversation>`,
      ],
    });
    return { sent: true, note: "The team has been notified in Slack." };
  },

  async test(connection, { assistantName }) {
    await postToSlack(connection, {
      title: `Test from ${BRAND.name}`,
      body: `${assistantName} can post here. This is only a test.`,
      details: [],
    });
    return { note: "Test message sent" };
  },

  async revoke(connection) {
    await callProvider(`${API}/apps.uninstall`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Bearer ${connection.secret.access_token}` },
      body: new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID ?? "", client_secret: process.env.SLACK_CLIENT_SECRET ?? "" }),
    }).catch((error) => console.error("Slack uninstall failed", error));
  },
};
