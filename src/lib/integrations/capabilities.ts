import type { ActionParameter } from "@/lib/types";

// What connected services let the assistant do, named by the job rather than
// the service: the assistant calls create_ticket whether tickets go to
// Zendesk, Salesforce or HubSpot. Each capability is one action of kind
// "integration", with config { capability, provider } saying which connected
// service handles it (src/lib/integrations/providers).

export type Capability = "notify_team" | "create_ticket" | "save_lead" | "find_meeting_times" | "book_meeting";

export type CapabilitySpec = {
  // The tool name the model sees.
  name: string;
  title: string;
  // One line for owners on the Integrations page.
  summary: string;
  description: string;
  parameters: ActionParameter[];
  // Changes something outside the conversation a visitor could object to.
  confirmByDefault: boolean;
  // Most uses a single conversation gets, so a confused or manipulated
  // assistant can't flood the team's tools.
  maxPerConversation: number;
};

const EMAIL: ActionParameter = {
  name: "email",
  type: "string",
  description: "Their email. Leave it out if they're signed in; otherwise ask for it first.",
  required: false,
};
const NAME: ActionParameter = {
  name: "name",
  type: "string",
  description: "Their name, if you know it.",
  required: false,
};

export const CAPABILITIES: Record<Capability, CapabilitySpec> = {
  notify_team: {
    name: "notify_team",
    title: "Notify the team",
    summary: "When the team should know: a hot lead, an upset customer, a bug.",
    description:
      "Post a message to the team's chat about something that needs a person's attention now: a promising lead, an upset customer, a problem blocking someone, or a request you can't handle. Write it so a teammate can act without reading the conversation. Don't use it for routine questions, and don't tell the user unless it helps them.",
    parameters: [
      { name: "message", type: "string", description: "What happened and what the team should do.", required: true },
      { name: "urgency", type: "string", description: "How soon someone should look.", required: false, enum: ["low", "normal", "high"] },
    ],
    confirmByDefault: false,
    maxPerConversation: 3,
  },
  create_ticket: {
    name: "create_ticket",
    title: "Create a support ticket",
    summary: "When someone needs support to get back to them by email. The ticket has their request, their email and a link to the conversation.",
    description:
      "Open a support ticket so the support team follows up with the user by email. Use it when they want someone from support to get back to them, or when you can't solve the issue yourself. Write a clear subject and a complete description: what happened, what they tried, and what they need.",
    parameters: [
      { name: "subject", type: "string", description: "A short summary, like an email subject.", required: true },
      { name: "description", type: "string", description: "The full details the support team needs.", required: true },
      {
        name: "priority",
        type: "string",
        description: "How urgent it is for the user.",
        required: false,
        enum: ["low", "normal", "high", "urgent"],
      },
      EMAIL,
      NAME,
    ],
    confirmByDefault: false,
    maxPerConversation: 2,
  },
  save_lead: {
    name: "save_lead",
    title: "Save a sales lead",
    summary: "When someone wants to hear from sales.",
    description:
      "Save someone interested in buying, a demo or a sales call to the sales team's CRM, with what they're looking for. Ask for their name and email first (and company, if it matters), and only save them if they want to be contacted.",
    parameters: [
      { name: "name", type: "string", description: "Their full name.", required: true },
      { ...EMAIL, description: "Their email. Leave it out if they're signed in." },
      { name: "company", type: "string", description: "Their company, if they mentioned it.", required: false },
      { name: "phone", type: "string", description: "Their phone number, if they gave it.", required: false },
      { name: "notes", type: "string", description: "What they're interested in and anything sales should know.", required: true },
    ],
    confirmByDefault: false,
    maxPerConversation: 2,
  },
  find_meeting_times: {
    name: "find_meeting_times",
    title: "Find meeting times",
    summary: "Offers open times in the visitor's time zone.",
    description:
      "Look up open times for a meeting with the team. Offer the user two or three of them, in their time zone, and let them pick.",
    parameters: [
      {
        name: "from_date",
        type: "string",
        description: "First day to look at, as YYYY-MM-DD. Defaults to today.",
        required: false,
      },
      {
        name: "days",
        type: "number",
        description: "How many days to look ahead, 1 to 14. Defaults to 7.",
        required: false,
      },
      {
        name: "time_zone",
        type: "string",
        description: "The user's IANA time zone, like Europe/Berlin. Leave it out to use theirs.",
        required: false,
      },
    ],
    confirmByDefault: false,
    maxPerConversation: 8,
  },
  book_meeting: {
    name: "book_meeting",
    title: "Book a meeting",
    summary: "Books the time the visitor picks.",
    description:
      "Book a meeting at a time the user picked from find_meeting_times. You need their name and email (unless they're signed in). Read the time back to them in their time zone before booking.",
    parameters: [
      {
        name: "start_time",
        type: "string",
        description: "The start time exactly as find_meeting_times returned it.",
        required: true,
      },
      { ...NAME, description: "Their full name.", required: true },
      EMAIL,
      { name: "notes", type: "string", description: "Anything the team should know before the meeting.", required: false },
    ],
    confirmByDefault: true,
    maxPerConversation: 2,
  },
};

export const CAPABILITY_ORDER: Capability[] = ["notify_team", "create_ticket", "save_lead", "find_meeting_times", "book_meeting"];
