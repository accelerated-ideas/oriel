<p align="center">
  <img src="public/logo.png" width="80" alt="Oriel logo" />
</p>

<h1 align="center">Oriel</h1>

<p align="center">
  Give your product a voice
  <br />
  <br />
  <a href="https://useoriel.com">Website</a>
  ·
  <a href="https://github.com/accelerated-ideas/oriel/issues">Issues</a>
</p>

## About Oriel

Oriel is a voice assistant for your website or app. You add it with one script tag. Visitors click a button and talk to it, or type if they prefer.

It answers questions about your product, takes people to the page they need, and does things for them, like updating their billing. When someone gets stuck, it writes that down for your team.

You can use the hosted version at [useoriel.com](https://useoriel.com), or run it yourself for free with every feature included.

## Features

- **Voice calls.** People talk to it like they would to your support team, in one of ten languages. They can interrupt it, and every call is saved as a transcript.
- **Chat.** The same assistant for people who'd rather type. It knows the same things and can do the same things.
- **Learns your product.** Give it your website, your docs, or files like PDFs and Word documents. It re-reads your pages so its answers stay current.
- **Shows people around.** It knows which page the visitor is on. It can take them to another page and point at the button they need.
- **Takes action.** It can call your API, run functions in your app, and look up or change things in Stripe. You decide which actions need a "yes" from the visitor first.
- **Knows who's signed in.** Your server tells it who the visitor is, so it only touches that person's account.
- **Feedback for your team.** Bugs, feature requests, complaints and people about to cancel get written up for you. Visitors can also ask for someone to get back to them.
- **Integrations.** Post to Slack, open tickets in Zendesk, Salesforce or HubSpot, save leads, and book meetings with Cal.com or Calendly.
- **Your choice of model.** Claude, Gemini or GPT, with a backup model in case the first one fails.
- **Workspaces.** Invite your team. Agencies can keep one workspace per client.

## How it works

1. **Teach it.** Add your website, docs and files, and list the pages it can send people to.
2. **Give it actions.** Turn on Stripe, describe your API endpoints in a form, or register functions from your app.
3. **Add it to your site.** Paste the script tag from your assistant's Install page:

```html
<script src="https://useoriel.com/embed.js" data-agent-id="your-assistant-id" async></script>
```

To let it act on a signed-in user's account, sign a token (a JWT) on your server with the assistant's identity secret, and pass it in with `Oriel("identify", { token })`.

On a call, Gemini turns the visitor's speech into text, the assistant's model writes a reply, and ElevenLabs speaks it. Chat and calls run through the same code, so they share knowledge, actions and history.

## Built with

- Next.js, React and Tailwind CSS
- Supabase (Postgres with pgvector, and sign-in)
- Claude, Gemini and GPT through the Vercel AI SDK
- Gemini and ElevenLabs for speech
- Stripe, Resend and Upstash

## Run it yourself

A self-hosted install has every feature, with no plans or limits. You bring your own database and API keys.

### Local setup

You need Node 22 or newer, Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                 # starts a local database
cp .env.example .env.local     # then add your keys
npm run dev                    # http://localhost:3010
```

- Locally, sign-in codes go to Mailpit at http://127.0.0.1:55424 instead of your inbox.
- Your first sign-in creates a workspace. Create an assistant and open its Playground to talk to it.
- `npm run app-assistant` adds the help assistant that answers questions inside the dashboard.
- `npm run db:reset` wipes your local data and rebuilds the database.
- Google sign-in is optional. Put a Google OAuth client's ID and secret in `.env` (not `.env.local`), add `http://127.0.0.1:55421/auth/v1/callback` as a redirect URI, and restart Supabase.

### Environment

`.env.example` explains every setting. To start, you only need:

- `NEXT_PUBLIC_APP_URL`: where the app runs.
- The Supabase URL and keys, from `supabase status`.
- `GOOGLE_API_KEY`: Gemini, for search, summaries and understanding speech on calls.
- `WIDGET_SESSION_SECRET` and `ENCRYPTION_KEY`: two random strings, for example from `openssl rand -hex 32`. Don't change `ENCRYPTION_KEY` later, or saved keys can't be read.

Add these when you need them:

- `ELEVENLABS_API_KEY` for voice calls. Without it, assistants are text only.
- `ANTHROPIC_API_KEY` for Claude Haiku, the default model. Without it, assistants use Gemini.
- `OPENAI_API_KEY` for GPT.
- `RESEND_API_KEY` for emails like invitations and follow-ups.

Leave `NEXT_PUBLIC_EDITION` unset. Setting it to `cloud` turns on the plans, billing and marketing site we use for useoriel.com.

### Deploying

It's a standard Next.js app. We run it on Vercel with a hosted Supabase project.

- Set `NEXT_PUBLIC_APP_URL` before you build. It's written into the embed script.
- Apply the migrations in `supabase/migrations` to your Supabase project, for example with `supabase db push`.
- Set `CRON_SECRET`. The scheduled jobs in `vercel.json` use it to refresh knowledge every day.
- Sign-in codes are sent by Supabase, so set up email (SMTP) in your Supabase project.

### Integrations

Each assistant connects its own services on its Integrations page. Every service gives the assistant a job to do:

| Job | Services |
| --- | --- |
| Tell the team when to step in | Slack |
| Open a ticket | Zendesk, Salesforce, HubSpot |
| Save a lead | Salesforce, HubSpot |
| Book a meeting | Cal.com, Calendly |
| Look up and change billing | Stripe |

<details>
<summary>Setting up each service</summary>

<br />

Services connect with OAuth, a key, or both. For OAuth, register `<NEXT_PUBLIC_APP_URL>/api/integrations/<service>/callback` as the redirect URL. If a service's keys are missing, its card in the dashboard says so.

- **Stripe:** customers can paste a restricted key, or install our Stripe App. To publish the app, upload it to your live Stripe account with `stripe apps upload integrations/stripe-app --live`, then set `STRIPE_APP_INSTALL_URL` to its install link. Stripe has to review it before other accounts can install it.
- **Slack:** create an app from `integrations/slack-app-manifest.yml`, then set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`. Slack only accepts https redirect URLs, so locally run `npm run dev:https` with `NEXT_PUBLIC_APP_URL=https://localhost:3010`. Turn on public distribution so other Slack workspaces can install it.
- **Zendesk:** nothing to set up. Each customer creates an OAuth client in their own Zendesk, and the dashboard walks them through it.
- **Salesforce:** customers create their own app in Salesforce, and the dashboard walks them through it. For a one-click button, package your own app and set `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`.
- **HubSpot:** customers can paste a service key. For a Connect button, create a HubSpot app and set `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET`. It works in up to 25 accounts until it's listed on HubSpot's marketplace.
- **Cal.com:** customers can paste an API key, which also works with self-hosted Cal.com. For a Connect button, create an OAuth client with the scopes `PROFILE_READ`, `EVENT_TYPE_READ`, `BOOKING_READ` and `BOOKING_WRITE`, then set `CALCOM_CLIENT_ID` and `CALCOM_CLIENT_SECRET`.
- **Calendly:** customers can paste a personal access token. For a Connect button, create an OAuth app with the scopes `users:read`, `event_types:read` and `scheduled_events:write`, then set `CALENDLY_CLIENT_ID` and `CALENDLY_CLIENT_SECRET`. Booking needs a paid Calendly plan. On a free plan, the assistant sends a booking link with the visitor's details filled in.

</details>

## Known limits

- Calls have been tested with a simulated microphone, not yet with real mics and speakers.
- After a page load, some browsers block audio until the visitor clicks "Continue call".
- The Slack, Zendesk, Salesforce, HubSpot, Cal.com and Calendly connections have been tested against mock services, not real accounts yet.
- Actions can't reach private network addresses, but a DNS rebinding attack can still get past that check. Fix this before running actions you don't trust.

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. On your first pull request you'll be asked to sign our [CLA](CLA.md), once.

Found a security issue? Please report it privately. See [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Accelerated Ideas OÜ. Oriel is open source under the [AGPL-3.0](LICENSE) license, including the hosted service's billing and the marketing site.

If you run a changed version of Oriel as a service for other people, you have to share your source code with them. For a commercial license without these terms, email hello@useoriel.com.

The Oriel name and logo aren't covered by the license. See [TRADEMARKS.md](TRADEMARKS.md).
