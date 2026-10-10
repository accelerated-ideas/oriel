import stripeApp from "../../../../integrations/stripe-app/stripe-app.json";
import type { IntegrationBrand } from "@/components/brand/integration-logos";
import type { Question } from "@/components/web/landing/faq-questions";
import type { PaletteName } from "@/components/web/landing/backdrop";

// The public pages for each integration (/integrations and /integrations/[slug]),
// written from what the code does: the jobs in src/lib/integrations/capabilities.ts,
// each service's scopes in src/lib/integrations/providers, the Stripe app's
// permissions in integrations/stripe-app/stripe-app.json, and the Stripe
// actions in src/lib/actions/stripe-catalog.ts. Update them together.

export type Category = "Billing" | "Support" | "CRM" | "Scheduling" | "Team chat";

export type Listing = {
  slug: string;
  name: string;
  logo: IntegrationBrand | "stripe";
  categories: Category[];
  palette: PaletteName;
  // One line under the name, and on the overview's cards.
  tagline: string;
  // For search results and link previews (about 150 characters).
  description: string;
  overview: string[];
  features: { title: string; text: string; image?: { src: string; alt: string } }[];
  // How someone connects it, in order.
  connect: string[];
  // What Oriel can reach in the service, and why.
  access: { name: string; why: string }[];
  availability: string;
  connection: string;
  questions: Question[];
};

// The Stripe app's permissions, as people read them, with the purposes the
// app shows Stripe users when they install it.
const STRIPE_PERMISSION_NAMES: Record<string, string> = {
  customer_read: "Read customers",
  subscription_read: "Read subscriptions",
  subscription_write: "Change subscriptions",
  invoice_read: "Read invoices",
  payment_method_read: "Read payment methods",
  product_read: "Read products",
  plan_read: "Read prices",
  customer_portal_write: "Create billing portal links",
  connected_account_read: "Read account details",
};

const ALL_PLANS = "Every plan, including the free trial";

export const LISTINGS: Listing[] = [
  {
    slug: "stripe",
    name: "Stripe",
    logo: "stripe",
    categories: ["Billing"],
    palette: "stripe",
    tagline: "Answers billing questions and changes plans for customers signed in to your product.",
    description:
      "Connect Stripe to Oriel so your product's voice assistant answers billing questions and changes plans for signed-in customers, after they confirm.",
    overview: [
      "Connect your Stripe account and the assistant can help each customer who's signed in to your product with their own billing: which plan they're on, when it renews, the card they pay with, and their invoices.",
      "Turn on the actions you want, and it can also cancel a subscription, undo a cancellation, or switch to one of the plans you allow. It says exactly what will change and waits for the customer to confirm before it does anything in Stripe.",
    ],
    features: [
      {
        title: "Answer billing questions",
        text: "Customers ask about their plan, renewal date, invoices or card, and the assistant answers from Stripe, with a link to each invoice. It only ever discusses the billing of the person it's talking to.",
        image: { src: "/integrations/stripe/billing-questions.png", alt: "The assistant takes a customer to Billing and points at their latest invoice" },
      },
      {
        title: "Change plans in the conversation",
        text: "Choose which changes the assistant may make. It names the new plan and price, asks the customer to confirm, then updates the subscription in Stripe.",
        image: { src: "/integrations/stripe/plan-changes.png", alt: "A customer asks to switch to annual, confirms, and the plan changes in Stripe" },
      },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on Stripe, and install the Oriel app in your Stripe account. You can also paste a restricted key instead.",
      "Choose what the assistant may do. Looking up billing, listing invoices and sending a billing portal link are on to start; cancelling, undoing a cancellation and changing plans stay off until you turn them on.",
      "Make sure your product tells Oriel who's signed in, so the assistant can find their Stripe customer.",
    ],
    access: stripeApp.permissions.map((permission) => ({
      name: STRIPE_PERMISSION_NAMES[permission.permission] ?? permission.permission,
      why: permission.purpose,
    })),
    availability: "Pro and Premium, and the free trial",
    connection: "Oriel's Stripe app, or a restricted key",
    questions: [
      {
        q: "Can the assistant see other customers' billing?",
        a: "No. It finds the Stripe customer of the person who's signed in to your product, through the identity your product passes to Oriel, and only answers about that customer.",
      },
      {
        q: "Can it refund or charge anyone?",
        a: "No. It can look up billing, list invoices, send a billing portal link, and, if you turn them on, cancel, undo a cancellation or change plans. It never creates charges or refunds.",
      },
      {
        q: "Does it work with a Stripe sandbox?",
        a: "Yes. Install the app in a sandbox to try it with test customers before you connect your live account.",
      },
    ],
  },
  {
    slug: "slack",
    name: "Slack",
    logo: "slack",
    categories: ["Team chat"],
    palette: "iris",
    tagline: "Posts to your team's channel when someone needs a follow-up or the team should step in.",
    description:
      "Connect Slack to Oriel and your product's voice assistant posts to a channel when someone needs a follow-up, a hot lead turns up, or a customer is upset.",
    overview: [
      "Pick a channel, and the assistant posts there when the team should know about a conversation: a promising lead, an upset customer, a bug someone ran into, or a request it can't handle.",
      "Each message says what happened and what the team should do, with a link to the conversation, so whoever picks it up doesn't have to read it all first.",
    ],
    features: [
      {
        title: "Tell the team when it matters",
        text: "The assistant decides when a conversation needs a person's attention, and writes it up so a teammate can act on it right away.",
      },
      {
        title: "Follow-up requests in one place",
        text: "When a visitor asks for someone to get back to them, the request goes to your channel along with Insights, so nothing waits in an inbox.",
      },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on Slack and add the Oriel app to your workspace.",
      "Choose the channel it posts to, and send a test message.",
    ],
    access: [
      { name: "chat:write", why: "Posts messages as the Oriel app." },
      { name: "chat:write.public", why: "Posts to the public channel you pick without joining it first." },
      { name: "channels:read", why: "Lists your public channels so you can pick one." },
      { name: "groups:read", why: "Lists the private channels the app has been added to." },
    ],
    availability: ALL_PLANS,
    connection: "Slack app (OAuth)",
    questions: [
      {
        q: "Can Oriel read our Slack messages?",
        a: "No. It can post to the channel you choose and list channels so you can pick one. It doesn't read messages.",
      },
      {
        q: "Does it create channels?",
        a: "No. It posts to a channel that already exists. For a private channel, add the Oriel app to it first.",
      },
      {
        q: "Does it work with Enterprise Grid?",
        a: "Install it on a single workspace. Installs for a whole Enterprise Grid organization aren't supported.",
      },
    ],
  },
  {
    slug: "zendesk",
    name: "Zendesk",
    logo: "zendesk",
    categories: ["Support"],
    palette: "mint",
    tagline: "Opens Zendesk tickets for visitors who need a reply from your support team.",
    description:
      "Connect Zendesk to Oriel and your product's voice assistant opens support tickets with the request, the visitor's email and a link to the conversation.",
    overview: [
      "When a visitor needs someone from support to get back to them, or the assistant can't solve their problem, it opens a ticket in your Zendesk with a clear subject and the full story: what happened, what they tried, and what they need.",
      "The visitor becomes the ticket's requester, so your team replies by email from Zendesk as usual. Each ticket links back to the conversation.",
    ],
    features: [
      {
        title: "Create support tickets",
        text: "The assistant writes the subject and description and sets a priority, so tickets arrive ready to work on, not as a raw transcript.",
      },
      {
        title: "Replies go to the visitor",
        text: "Signed-in people are matched by their email; others are asked for it first. Your team answers from Zendesk, and the visitor gets it by email.",
      },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on Zendesk. Oriel shows the exact values to create an OAuth client in your Zendesk Admin Center, with copy buttons.",
      "Paste the client's identifier and secret, sign in to Zendesk to approve, and create a test ticket.",
    ],
    access: [
      { name: "tickets:read and tickets:write", why: "Creates tickets for visitors, and checks the test ticket." },
      { name: "users:read and users:write", why: "Finds the visitor in Zendesk by email, or adds them, so they're the ticket's requester." },
    ],
    availability: ALL_PLANS,
    connection: "Your own Zendesk OAuth client",
    questions: [
      {
        q: "Why do we create our own OAuth client?",
        a: "Zendesk ties OAuth clients to each Zendesk account. Creating one takes a minute in Admin Center, and Oriel shows every value to paste.",
      },
      {
        q: "Can the assistant read our existing tickets?",
        a: "It only works with the tickets it opens. It doesn't search or summarize your other tickets.",
      },
    ],
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    logo: "salesforce",
    categories: ["Support", "CRM"],
    palette: "sky",
    tagline: "Opens cases for support questions and saves leads from sales conversations.",
    description:
      "Connect Salesforce to Oriel and your product's voice assistant opens cases for support questions and saves leads for people who want to hear from sales.",
    overview: [
      "When someone needs support, the assistant opens a case with their request and contact details. When someone wants a demo or a call with sales, it saves them as a lead with what they're looking for.",
      "It asks for a name and email first, and only saves a lead when the person wants to be contacted.",
    ],
    features: [
      { title: "Open cases", text: "Support requests become Salesforce cases with a clear subject, the details your team needs, and a link to the conversation." },
      { title: "Save leads", text: "Interested visitors become leads, with their company and what they asked about, ready for your sales team." },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on Salesforce and sign in. If your org only allows its own apps, Oriel walks you through creating an External Client App instead.",
      "Choose which jobs go to Salesforce, and create a test case.",
    ],
    access: [
      { name: "api", why: "Creates cases and leads in your org." },
      { name: "refresh_token, offline_access", why: "Stays connected without asking you to sign in again." },
    ],
    availability: ALL_PLANS,
    connection: "Salesforce sign-in (OAuth), or your own External Client App",
    questions: [
      {
        q: "Can I use Salesforce for leads and Zendesk for tickets?",
        a: "Yes. Each job goes to the service you choose, so cases can go to one tool and leads to another.",
      },
      {
        q: "Does it work with a sandbox org?",
        a: "Yes. Enter your sandbox's address when you connect, and it signs in there.",
      },
    ],
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    logo: "hubspot",
    categories: ["Support", "CRM"],
    palette: "coral",
    tagline: "Opens tickets and saves contacts in HubSpot, linked to the person in your CRM.",
    description:
      "Connect HubSpot to Oriel and your product's voice assistant opens tickets and saves contacts, each linked to the right person in your CRM.",
    overview: [
      "The assistant opens HubSpot tickets for support requests and saves people who want to hear from sales as contacts. It matches the person by email, adding or updating their contact, and links each ticket to it.",
      "Your team sees every ticket next to the rest of that person's history in HubSpot.",
    ],
    features: [
      { title: "Open tickets", text: "Support requests become tickets with a subject, the full details and a priority, linked to the person's contact." },
      { title: "Save contacts", text: "Interested visitors become contacts with what they asked about, so sales can follow up." },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on HubSpot and approve the app, or paste a service key from HubSpot's settings.",
      "Choose which jobs go to HubSpot and the pipeline stage for new tickets, then create a test ticket.",
    ],
    access: [
      { name: "crm.objects.contacts.read and write", why: "Finds people by email and adds new contacts." },
      { name: "crm.objects.tickets.read and write", why: "Creates tickets and links them to the person." },
      { name: "crm.schemas.tickets.read", why: "Lists your ticket pipelines and stages, so you can choose where new tickets go." },
    ],
    availability: ALL_PLANS,
    connection: "HubSpot app (OAuth), or a service key",
    questions: [
      {
        q: "What happens if the person is already in HubSpot?",
        a: "It matches them by email and updates their contact with their name and what they asked about, instead of creating a duplicate. New tickets are linked to that contact.",
      },
    ],
  },
  {
    slug: "calcom",
    name: "Cal.com",
    logo: "calcom",
    categories: ["Scheduling"],
    palette: "amber",
    tagline: "Offers open times and books meetings during the conversation.",
    description:
      "Connect Cal.com to Oriel and your product's voice assistant offers open times in the visitor's time zone and books the meeting they pick.",
    overview: [
      "When someone wants a demo or a call, the assistant offers open times from the meeting type you choose, in their time zone, and books the one they pick, without sending them anywhere else.",
      "The booking lands in your Cal.com like any other, with the confirmation emails and calendar invites you already have.",
    ],
    features: [
      { title: "Find meeting times", text: "Open times from your Cal.com availability, read out or shown in the visitor's own time zone." },
      { title: "Book the meeting", text: "The visitor picks a time and the assistant books it with their name and email." },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on Cal.com and approve, or paste an API key.",
      "Choose the meeting type the assistant books.",
    ],
    access: [
      { name: "PROFILE_READ", why: "Shows which Cal.com account is connected." },
      { name: "EVENT_TYPE_READ", why: "Lists your meeting types so you can pick one." },
      { name: "BOOKING_READ and BOOKING_WRITE", why: "Finds open times and books the one the visitor picks." },
    ],
    availability: ALL_PLANS,
    connection: "Cal.com app (OAuth), or an API key",
    questions: [
      {
        q: "Whose calendar does it book on?",
        a: "The Cal.com account you connect, using the meeting type you choose, with that type's length, location and rules.",
      },
    ],
  },
  {
    slug: "calendly",
    name: "Calendly",
    logo: "calendly",
    categories: ["Scheduling"],
    palette: "sky",
    tagline: "Offers open times and books Calendly meetings during the conversation.",
    description:
      "Connect Calendly to Oriel and your product's voice assistant offers open times and books meetings, or sends a link to the time the visitor picked.",
    overview: [
      "When someone wants a demo or a call, the assistant offers open times from the event type you choose, in their time zone, and books the one they pick.",
      "Booking inside the conversation needs a paid Calendly plan. On a free plan, the visitor gets a link to the time they picked instead.",
    ],
    features: [
      { title: "Find meeting times", text: "Open times from your Calendly availability, in the visitor's own time zone." },
      { title: "Book the meeting", text: "The visitor picks a time and the assistant books it with their name and email, using the location Calendly sets for that event type." },
    ],
    connect: [
      "Sign in to Oriel and open your assistant's Integrations page.",
      "Press Connect on Calendly and approve, or paste a personal access token.",
      "Choose the event type the assistant books.",
    ],
    access: [
      { name: "users:read", why: "Shows which Calendly account is connected." },
      { name: "event_types:read", why: "Lists your event types and their open times." },
      { name: "scheduled_events:write", why: "Books the time the visitor picks." },
    ],
    availability: ALL_PLANS,
    connection: "Calendly app (OAuth), or a personal access token",
    questions: [
      {
        q: "Does it need a paid Calendly plan?",
        a: "Only to book inside the conversation. On a free plan the assistant still finds open times, then sends a link to the time the visitor picked.",
      },
    ],
  },
];

export function getListing(slug: string) {
  return LISTINGS.find((listing) => listing.slug === slug) ?? null;
}
