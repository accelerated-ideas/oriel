// The dashboard's pages, for the app's own help assistant. Paths use
// placeholders the dashboard fills in when the assistant navigates
// (see src/components/dashboard/app-assistant.tsx):
//   {workspace}  the workspace the user is in
//   {assistant}  the assistant they're in, or the workspace's only one; the
//                help assistant can also put an assistant's name there
export const APP_SITE_MAP: { title: string; path: string; description: string }[] = [
  { title: "Assistants", path: "/account/{workspace}/agents", description: "All assistants in the workspace; create a new one here." },
  { title: "Usage", path: "/account/{workspace}/usage", description: "Conversations, messages and call minutes by month." },
  { title: "Members", path: "/account/{workspace}/members", description: "Invite people, change roles, remove members." },
  { title: "Billing", path: "/account/{workspace}/billing", description: "Plan, limits, changing plan, invoices and payment." },
  { title: "Playground", path: "/account/{workspace}/agents/{assistant}/playground", description: "Try the assistant by chat or call." },
  { title: "Conversations", path: "/account/{workspace}/agents/{assistant}/conversations", description: "Every call and chat, with transcripts." },
  { title: "Insights", path: "/account/{workspace}/agents/{assistant}/insights", description: "Bugs, requests, confusion and follow-up requests from conversations." },
  { title: "Knowledge", path: "/account/{workspace}/agents/{assistant}/knowledge", description: "Websites, files and notes it answers from; refresh pages here." },
  { title: "Site map", path: "/account/{workspace}/agents/{assistant}/site-map", description: "Pages of the customer's site it can take visitors to." },
  { title: "Actions", path: "/account/{workspace}/agents/{assistant}/actions", description: "Built-in and custom actions (HTTP and browser)." },
  { title: "Integrations", path: "/account/{workspace}/agents/{assistant}/integrations", description: "Connect Stripe." },
  { title: "Behavior", path: "/account/{workspace}/agents/{assistant}/behavior", description: "Name, opening line, instructions, voice, language, AI model and fallback, follow-ups." },
  { title: "Install", path: "/account/{workspace}/agents/{assistant}/install", description: "Embed snippet, identifying users, allowed domains, the assistant's avatar and the bubble's look." },
];
