# Oriel

A voice-first assistant that customers embed on their site with one script tag. Visitors start a call, or type, and the assistant answers from the customer's knowledge, walks them around the site, and takes actions for them: their own HTTP endpoints, in-page functions, and Stripe.

The hosted service is at [useoriel.com](https://useoriel.com). The name is set in `src/config/brand.ts`, along with the embed global (`window.Oriel`) and the postMessage prefix.

## Stack

- Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind v4
- Supabase: Postgres + pgvector, sign-in with an emailed one-time code or with Google. Every query runs server-side with the service key; RLS is on with no policies.
- Replies, text and voice, come from each assistant's chosen model through the AI SDK: Claude `claude-haiku-5-5` (the default), Gemini `gemini-3.8-flash` or GPT `gpt-6-luna`, the current model from each provider (their previous versions cost more). A fallback model (Gemini 3.8 Flash by default) answers when the first fails. Embeddings use `gemini-embedding-2` at 768 dimensions. Models are set in `src/config/ai.ts`.
- Calls run our own pipeline: Gemini Live transcription (`gemini-3.5-transcribe-live`) for speech-to-text, with ElevenLabs Scribe realtime (`scribe_v2_realtime`) as the backup, and Eleven v4 Turbo (`eleven_v4_turbo`) for speech. Voice and text share the same turn loop, so they have the same knowledge, tools and history.

## How a turn works

```
text:  widget ── /api/widget/chat (SSE) ─────────────────────┐
voice: mic ─▶ Gemini or Scribe WebSocket (browser) ─ committed turn ─▶ /api/widget/voice/turn (SSE)
                                                             ▼
                              runAgentTurn (src/lib/runtime/run-turn.ts)
                              history + knowledge + site map + tools → the assistant's model
                                                             │
                     server tools run here ◀─────────────────┤
                     (knowledge search, HTTP, Stripe, feedback, follow-up)
                                                             │
                     browser tools go back to the widget
                     (navigate, registered actions, end call; pointing rides along in the reply)

voice replies: model tokens ─▶ sentence chunker ─▶ Eleven v4 Turbo WebSocket (server)
               ─▶ PCM audio + sentence text in the same SSE stream ─▶ widget player
```

### Calls

- **Listening.** The widget streams 16 kHz PCM from an AudioWorklet straight to the speech-to-text provider, using a single-use token from `/api/widget/voice`. API keys never leave the server.
  - **Gemini first** (`gemini-socket.ts`). Its token locks the model and settings (`src/lib/voice/gemini-transcribe.ts`). Gemini's voice detection ends the turn after 300ms of silence (`GEMINI_STT_SILENCE_MS`), and waits longer by itself when speech stops mid-sentence. On the same audio it finished a transcript 0.7–0.9s after a sentence ended, like Scribe. A project on Gemini's Tier 2 can run about 1,000 sessions at once. A session lasts at most 10 minutes; the call then reconnects.
  - **Scribe as the backup** (`scribe-socket.ts`). Its voice detection ends the turn after 0.55s of silence (`STT_VAD_SILENCE_SECS`), set a little stricter than its defaults (`STT_VAD_THRESHOLD` 0.45, `STT_MIN_SPEECH_MS` 250) so clicks and quiet voices across the room don't start a turn. Its `filter_background_audio` was tested and left off: it was slower and once missed a soft voice. Scribe allows only as many open sessions as the ElevenLabs plan (15 on Creator), counts quiet ones too, and refuses the rest with `rate_limited`.
  - **Switching.** A connection that drops after working reconnects to the same provider, waiting a little longer each time (`STT_RETRY_DELAYS_MS`). One that can't start, has no room, or keeps dropping makes the call ask `/api/widget/voice` again with that provider in `avoid`, and the server hands out the next one. Audio from the gap is held (up to about 5s) and sent to the new connection, so nothing said is lost. When no provider is left, the call ends with "Calls are busy right now" or "Speech recognition isn't available right now", and stays on screen.
- **Speaking.** `/api/widget/voice/turn` sends the model's text to Eleven v4 Turbo and streams the audio and its text back to the widget. v4 Turbo is only available on the Text to Dialogue WebSocket, not `/stream-input`.
  - Text goes in whole sentences only: the voice starts speaking once it has about 8 words, so half a sentence would be voiced before it knows the sentence ends in a question.
  - The first sentence is voiced alone so speech starts quickly. The rest of the reply is voiced together, because sentences voiced one by one are stitched back to back and sound like lines read out. In blind listening tests (Gemini judging) this scored best on question intonation and flow. Very long sentences go a clause at a time (`speech-chunker.ts`).
  - Pointing markers carry their position in the text, so each fires as the voice reaches it.
- **Captions.** The speech socket runs with `sync_alignment=true`, so every audio chunk carries the time each character is spoken. The widget reveals the reply character by character on the audio clock (`speech-player.ts`). If timings are missing, it estimates them from how much audio has played.
- **Interruptions.**
  - When the user starts talking over the assistant, the voice ducks within about 240ms (local voice detection).
  - It stops once speech-to-text hears real words that aren't the assistant's own echo and aren't "mhm", and only while the mic also hears someone close by. Words from a TV or a colleague across the room don't cut it off; a finished sentence still does.
  - The widget reports how much of each reply was actually heard, which is exactly what the captions had shown. The stored message is cut there and ends with "—" (`src/lib/voice/interruptions.ts`), so the model knows what the user missed.
- **Minimized calls.** The call keeps going with the panel closed. The launcher turns green, and its wave icon follows the assistant's voice while it speaks: the widget sends voice levels to the loader about 30 times a second. Reopening the panel just shows the call.
- **Opening lines.** A new conversation's first call says the greeting. Calling again after a real exchange gets "I'm here. What else can I help with?" If the last thing said was already one of those lines, unanswered, a new call says nothing and just listens. None of these count as messages for the customer; only what visitors send does.
- **Page loads.** A call carries on across full page loads, whether the assistant moved the page or the visitor did, and stays minimized if it was. When the visitor moved the page, the assistant says nothing and keeps listening. If the browser holds back audio on the new page, the launcher says "Continue call", and clicking it resumes.
- **Pointing.** The assistant can point at anything visible: buttons, links and fields by their label, and any other text such as a number, a status or a card's title. Plain text gets the ring around the card, tile or row it sits in (`findTarget` in the embed script). Only what can be seen or scrolled to counts: closed menus, off-screen drawers and screen-reader-only text are skipped, and open shadow roots are searched too. "Messages box" prefers the card over a link named Messages. The ring scrolls the page only when the element is out of sight or covered, follows it every frame, and finds it again if the page re-renders it. The model points by wrapping a name in its reply ("Press [[Send]] in the top right") rather than with a tool, in chat and on calls. A tool call would add a second model round trip, and usually a second message saying it pointed. The brackets are dropped and the name stays in the text, speech and stored transcript, so a sentence never loses it (`inline-markers.ts`). On calls each one waits until the voice reaches it (`SpeechPlayer.cue`).
- **Latency.** The reply starts after turn detection (about 0.6s), Gemini's first words, and about 0.2s for v4 Turbo. Our own work before calling Gemini takes about 15ms. Gemini 3.8 Flash dominates and varies a lot: 1.5–3.3s in one session, a median of about 3.7s with spikes past 10s in another (October 2026). Its thinking settings barely change this (it thinks for only about 100–300 tokens), and the priority service tier didn't lower the median either. Gemini 3.5 Flash with minimal thinking answered in about 0.9s in tests with similar answers. That's why Claude Haiku 5.5 is the default model: in a test on October 8, 2026 it started answering in 0.5–1.0s, against 1.8–2.1s for Gemini 3.8 Flash (one reply took 8.9s) and 1.4–2.2s for GPT-6 Luna, and cost less per turn than Gemini.
- Tuning lives in `src/components/widget/voice/voice-call.ts` (barge-in) and `turn-taking.ts` (echo and backchannel rules).

- **Models and fallback.** Each assistant picks the model that writes its replies (`agents.chat_model`, set on its Behavior page) and a fallback (`agents.fallback_model`, Gemini 3.8 Flash by default, or none). New assistants start on Claude Haiku 5.5. The choices, and each model's thinking settings, are in `src/config/ai.ts`. Thinking is set per channel; all three think a little (low) on calls and in chat. On calls it costs time before the first word (Haiku: a median 1.49s instead of 0.76s in tests) but halved the slips a reviewing model found. Gemini 3.8 Flash can't go below low.
  - A turn switches to the fallback when the model errors, or hasn't started answering after 12 seconds (`FALLBACK_AFTER_MS`), before anything reached the visitor. The fallback then answers the rest of the turn. Once part of a reply has been said, a failure ends the turn as before, so nothing is said twice.
  - With a fallback ready, the model isn't retried: switching is quicker. Without one, it's retried once.
  - A model whose provider has no API key on the server can't be picked, and is skipped at runtime: the turn uses the default model, or else the first usable one (`resolveChatModels`). Without `ANTHROPIC_API_KEY`, assistants on the default use Gemini 3.8 Flash.
  - **Prompt layout.** The system prompt is two blocks. The first (instructions, knowledge, site map, the user) stays the same from turn to turn and is cached: Anthropic gets a cache mark on it, Gemini and OpenAI cache matching prefixes on their own. The second is what's true right now: which page the user is on, this turn's knowledge and site map matches (for knowledge too big to send whole), the time, and the conversation summary when the history has been cut to its latest messages (`HISTORY_MESSAGE_LIMIT`). Putting that block after the latest message instead, as a note in the user's turn, made Haiku say its reasoning aloud on calls, so it stays in the system prompt.
  - **Reading the page.** Gemini and GPT-6 Luna read the page on nearly every turn, a model step each time, so their prompt adds a note to read it only when the answer depends on the screen (`pageReading` in `src/config/ai.ts`).
  - **Feedback** results carry the entry's id, and `capture_feedback` takes an optional `updates` id: when the model learns more about an issue it already recorded, it updates that entry instead of adding a second one.
  - Conversations can move between providers. Gemini's tool-call signatures are kept with each call; tool calls from other models get Google's placeholder signature (the AI SDK adds it). OpenAI runs with `store: false`, so OpenAI keeps no copy of the conversation.

- **Current page.** The loader reports page changes, and every message (typed or spoken) also carries a snapshot of the page taken as it's sent, so the assistant sees where the visitor is even right after a click or once a single-page app finishes rendering (`src/lib/widget/page.ts`). Full page loads are recorded as moves too. The prompt only says which page they're on (title and address). With "Read the current page" on, the snapshot also has the page's visible text and where its links go, and the assistant reads it with the `read_page` tool when it needs to: to answer about the screen, before pointing, or to open an item listed there. Each read stays in the history, so the assistant keeps what it saw on pages the visitor has since left.
- **Widget.** `/embed.js` adds a launcher in a shadow root and an iframe at `/widget/[agentId]`. The iframe and the host page talk over postMessage (`src/components/widget/host-bridge.ts`). The loader runs the browser tools on the host page. When a full page load interrupts a navigation, it reopens the panel after the load and the conversation continues there.
- **Playground** (`/account/[orgId]/agents/[agentId]/playground`, first in an assistant's sidebar): the real widget in a box on that page and nowhere else. The page plays the embed script's part (`playground.tsx`).
  - **Test conversations:** they're marked `is_preview`, but only for signed-in members of the workspace. The assistant is told it's the team trying it out: it won't call them logged out, and a tool that needs a signed-in customer says it works on the site.
  - **No page actions:** it doesn't navigate (it says where it would go), point, or run the site's code.
- **Help assistant:** the app's own assistant, a "Need help?" bubble on every dashboard page. It's a normal assistant in an internal workspace that knows the dashboard (`src/content/app-assistant/guide.md`) and its pages (`site-map.ts`).
  - **Setup:** `npm run app-assistant` creates or updates it and prints `NEXT_PUBLIC_APP_ASSISTANT_ID` to set. Re-run it after editing the guide.
  - **Navigation:** it moves between dashboard pages without a reload. Its paths use `{workspace}` and `{assistant}`. `{assistant}` is the assistant the user is in, or the workspace's only one; with several it puts the assistant's name there instead. When it can't tell which, navigation fails with a message saying so, and it asks.
  - **Identity:** the dashboard identifies the user with a signed token.
  - **Page text:** it reads the visible text and links of the page, which can include customers' data. Turn off "Read the current page" on its Behavior page if you'd rather it didn't.
- **Knowledge.** See "Knowledge" below.
- **Site map.** Places in the product, with what they're for and whether they need a login. The model uses it to navigate and point at things.
  - **Import:** paste links (or spreadsheet/CSV columns: name, link, description), load a file, or read a sitemap. Unnamed pages are named from their links (`src/lib/site-map/pages.ts`).
  - **Size:** each plan sets the pages per assistant (`site_map_pages`: 200, 1,000, 5,000); self-hosted installs get 10,000. Articles and docs belong in Knowledge.
  - **In the prompt:** small site maps go in whole. Larger ones (over `INLINE_SITE_MAP_MAX_CHARS`) are searched each turn by meaning and words, like knowledge, and the model gets `find_page` for the rest (`src/lib/site-map/search.ts`). Pages are embedded in the background after they change.
- **Actions.** The dashboard is a form over tool definitions. The editor shows the exact tool the model receives.
  - **HTTP actions** call the customer's API. Header values are encrypted at rest.
  - **Browser actions** call functions registered on the page with `Oriel("registerAction", ...)`.
  - **Stripe operations** use the customer's restricted key, always scoped to the identified user's `stripe_customer_id`.
  - Actions can require a signed-in user, and confirmation before running (`src/lib/runtime/confirmations.ts`). A confirmed action runs on the model's second call: the first records what it proposed and tells it to ask, then the user must reply before a call with `confirmed: true` for the same target (the action's required arguments) goes through. The model judges whether the reply was a yes; the server checks the order, so nothing the model reads can run an action by itself.
- **Identity.** The customer's server signs an HS256 JWT with the assistant's identity secret. The page passes it to `Oriel("identify", { token })`. Unverified visitors never reach identity-gated actions or Stripe.
- **Insights** are logged by the assistant during the conversation: `capture_feedback` for what the visitor went through with the product (a bug they hit, a feature they asked for, confusion, a complaint, praise, churn risk), and `escalate_to_human` for follow-up requests (the team gets back to the visitor later; nobody joins the conversation live). They're about the visitor and the product, never about the assistant's own behavior. When a conversation ends it's summarized (title, summary, sentiment, resolved), not reviewed for more insights.

## Knowledge

- **Sources:** notes, files (PDF, DOCX, Markdown, text, CSV, HTML) and website pages. Pages and files become Markdown (Turndown), so headings, lists and tables survive.
- **Background work:** everything is indexed by a background worker, never inside a web request.
  - Adding knowledge queues jobs (`knowledge_jobs`) and wakes `/api/knowledge/worker`.
  - Each run works for about 4 minutes, claims jobs with row locks, and hands over to a new run if work remains. A job whose worker died is picked up again when its lease runs out.
  - Opening the Knowledge page wakes a stalled queue, and the daily cron (`vercel.json`) does too.
- **Adding a website** ("Add website" panel), in one of three ways:
  - **Crawl site:** finds pages under an address, preferring `/llms.txt`, then sitemaps (from robots.txt or `/sitemap.xml`, nested and gzipped), then links.
  - **Sitemap:** every page a given sitemap lists.
  - **Single page:** one page, read right away.
- **Crawl and Sitemap imports** (`knowledge_imports`):
  - **Choosing pages:** they only find pages (`knowledge_found_pages`). The owner then chooses which to add, by filtering and ticking or adding everything, and only those are read. The assistant's setup import is the exception: it adds its first 15 pages right away.
  - **Options:** excluded paths (starts with, ends with, contains, exact, or wildcard), query parameters as separate pages, slow mode (one page every few seconds), and up to 10,000 pages.
  - **Always:** same site only, robots.txt respected, tracking parameters dropped, linked PDFs included.
- **Pages built in the browser:** each page is fetched without JavaScript first. Only pages that come back nearly empty are opened in headless Chromium (`renderer.ts`, Playwright). Images and fonts are blocked, and so is any request to a private address. Set `KNOWLEDGE_BROWSER` to choose where the browser runs:
  - **`local`** (default): `@sparticuz/chromium` on Vercel and Lambda; elsewhere `CHROMIUM_PATH` or an installed Chrome.
  - **`remote`:** a hosted browser over CDP at `BROWSER_WS_ENDPOINT`, e.g. Browserless.
  - **`off`:** such pages fail with a message asking for the content to be uploaded.
- **Chunks:** about 1,100 characters, split along headings. Each chunk starts with where it came from ("Pricing › Pro plan"). Tables keep their header row in every chunk. Each chunk is embedded with `gemini-embedding-2` (768 dimensions) into pgvector.
- **Refresh** is limited by plan (`refresh_every_hours`, `auto_refresh_days` in `subscription-plans.ts`), because reading pages is what costs. Pages whose text hasn't changed (`content_hash`) aren't embedded again.

  | Plan | Manual re-read, per page | Automatic |
  |---|---|---|
  | Trial, Starter | weekly | off |
  | Pro | daily | weekly |
  | Premium | hourly | daily |
  | Self-hosted | any time | every `KNOWLEDGE_AUTO_REFRESH_DAYS` (7) |

  - **Manual:** owners re-read selected pages, or all of an import's pages. Pages read too recently are skipped, with the time they can be read again. Failed pages can always be retried.
  - **Automatic:** the daily cron queues pages due on each workspace's plan.
- **Answering:**
  - Knowledge up to 24k characters goes into the prompt in full.
  - Above that, each turn gets the pinned sources plus the 6 best chunks from `search_knowledge` (SQL), and the model can search again with the `search_knowledge` tool.
  - Short follow-ups are searched together with the previous question.
  - Search merges two rankings, with meaning counting double: the nearest chunks by meaning (HNSW, with iterative scans so one assistant's results aren't crowded out by others in the shared index), and keyword matches on words that are rare in that assistant's knowledge.
- **Pinned sources** (up to 30,000 characters) are in every prompt, e.g. pricing.
- **Limits and costs:**
  - The plan's `knowledge_characters` caps a workspace's ready knowledge (cloud). An import that hits it stops and says why.
  - Embeddings are recorded as `embedding` usage (indexing and search). Gemini doesn't report embedding tokens, so they're estimated at 4 characters per token.

## Usage and costs

- **Customers** see conversations, messages (sent by visitors) and call minutes on the Usage page (`/account/[orgId]/usage`).
  - The goodbye that ends a conversation isn't counted: when the assistant answers a visitor message by closing the conversation (`end_call` on calls, `end_chat` in chat), that message is stored with `billable = false` (`run-turn.ts`). It follows what the assistant actually did, not the wording.
- **What it costs us** is recorded per model call in `usage_events` and shown only to platform admins at `/admin/costs`. Admins are listed in `PLATFORM_ADMIN_EMAILS`.
  - **Language model:** recorded per turn and model (a turn the fallback finished has a row for each), from the provider's token counts.
  - **Speech:** recorded per turn, from the characters sent to v4 Turbo.
  - **Transcription:** recorded per call and provider, from the audio the widget sent each one. Gemini also bills the text it returns, estimated from its length.
  - **Summaries:** recorded too.
- Prices live in `src/lib/usage/pricing.ts`, with the dates they take effect. Each cost uses the rate on the day of the call. Update the list and bump `PRICING_VERSION` when a provider changes prices.

## Editions

The whole repository is open source (see "License"), including the hosted service's billing and the marketing site. The hosted version is the paid product. `NEXT_PUBLIC_EDITION` picks which one an install is (`src/config/edition.ts`):

| | Self-hosted (default) | Cloud (`NEXT_PUBLIC_EDITION=cloud`) |
| --- | --- | --- |
| `/` | Redirects to the dashboard | Marketing site |
| Plans, limits, Billing page | None: every feature, no limits | From `src/config/subscription-plans.ts` |
| Workspaces, members, invitations | Yes | Yes, with seats per plan |
| "Powered by Oriel" in the widget | Shown; owners can hide it (Install > Appearance) | Shown; the Premium plan can hide it |

A self-hosted install serves the dashboard at `/`; the marketing site (`src/app/(web)`, `src/components/web`) is only used by the cloud edition.

**Search and sharing (cloud):** every page of the marketing site has a title, description and canonical address (`pageMetadata` in `src/components/web/seo.tsx`), and a link preview picture drawn by its `opengraph-image.tsx` (`src/components/web/og/`: the brand, the page's headline and the widget from the launch film's poster). The pages carry structured data (JSON-LD): the company and site on every page, the product with its plans on the landing and pricing pages, their questions, and the legal pages' last update. `robots.txt` and `sitemap.xml` list only the public pages. Everything else (dashboard, sign-in, invitations, the widget's frame) is marked noindex, and a self-hosted install is closed to search entirely. Absolute addresses use `NEXT_PUBLIC_APP_URL`.

## Workspaces, members and billing

- **Workspaces:** a workspace (`organizations`) owns assistants, members and a plan.
  - Signing up doesn't create one. The first visit to `/account` does, unless the person has an invitation; then they're sent to it instead.
  - People can create more workspaces from the account menu, for example an agency with one per client.
  - Each workspace is billed on its own. Each person gets one 14-day trial; workspaces they create after that need a plan.
- **Members:** owners and admins invite people by email from Members (`/account/[orgId]/members`). Roles:
  - **Owner:** the creator.
  - **Admin:** can also invite people, rename the workspace and manage billing.
  - **Member:** builds and runs assistants.
  - Invitation links work for 14 days. They're emailed through Resend when it's set up; either way the link can be copied from the Members page. Someone who already has an account sees their invitations on the dashboard home.
- **Emails (cloud):** through Resend, in the landing page's style (`src/lib/emails/template.ts`; the wordmark is `public/email/wordmark.png`, loaded from `BRAND.siteUrl`).
  - **Welcome:** once per person, right after their first sign-in (`users.welcome_email_sent_at`).
  - **Subscribed:** when a workspace's first invoice is paid, to the email on the Stripe customer.
- **Plans (cloud):** prices, limits and Stripe product/price IDs (per environment) live in `src/config/subscription-plans.ts`. The landing page and the Billing page read them through `src/config/plans.ts`. Fill in the Stripe IDs after creating the products in Stripe.
- **Limits (cloud)** are in `src/lib/billing/limits.ts`:
  - **Assistants and seats:** checked when creating an assistant or inviting someone. Pending invitations count as seats.
  - **Messages:** a stored balance on the workspace (`message_credits`), and each visitor message takes one (a database trigger). Grants fill it (`src/lib/billing/credits.ts`), each applied once:
    - A new trial workspace starts with the trial's 100.
    - Paid invoices: the first payment and every renewal reset it to the plan's monthly messages; an upgrade adds the new plan's extra messages for the share of the month that's left.
    - The refill cron (`/api/billing/refill`, hourly in `vercel.json`) starts each new month on the billing date for yearly plans and comped workspaces, which have no monthly invoice.

    At zero, or with no active plan, the launcher hides and the assistant stops answering.
  - **Features:** the per-plan switches (actions, Stripe, identity) aren't enforced yet.
  - **Comping a workspace:** to give a workspace a plan without Stripe (e.g. your own demo), set `plan_id`, `subscription_status = 'active'` and `credits_renew_at = now()` on its row. The refill cron then gives it the plan's messages every month.
- **Billing (cloud):** Billing (`/account/[orgId]/billing`) runs on your Stripe account (`STRIPE_SECRET_KEY`).
  - **Choosing a plan:** opens Stripe Checkout.
  - **Changing plans:** shows what happens before it does, like Stripe's customer portal would. A switch that costs more per bill (an upgrade, or monthly to yearly) applies right away and charges the prorated difference; a declined card leaves the plan as it was. A cheaper plan, or yearly to monthly, waits for the next billing date as a subscription schedule, and choosing the current plan again cancels it.
  - **Invoices, card and cancelling:** handled in Stripe's customer portal.
  - **Webhook:** register `<NEXT_PUBLIC_APP_URL>/api/billing/webhook` for `checkout.session.completed`, `invoice.paid`, and `customer.subscription.created`, `.updated` and `.deleted`, and set `STRIPE_BILLING_WEBHOOK_SECRET`. Each paid invoice grants messages once, however often it's delivered.
  - **Testing locally:** `./start-webhooks.sh` forwards those events from your Stripe sandbox to the local app with the Stripe CLI, and saves the CLI's signing secret as `STRIPE_BILLING_WEBHOOK_SECRET` in `.env.local`.

## Integrations

Customers connect their own services on an assistant's Integrations page. Every service gives the assistant one or more jobs, and each job is one tool, named for what it does rather than for the service:

| Tool | What it does | Services |
| --- | --- | --- |
| `notify_team` | Posts to a channel when the team should step in. | Slack |
| `create_ticket` | Opens a ticket for the visitor, with a link to the conversation. | Zendesk, Salesforce (a Case), HubSpot |
| `save_lead` | Saves the visitor as a lead or contact. | Salesforce, HubSpot |
| `find_meeting_times`, `book_meeting` | Offers open times in the visitor's time zone and books one. | Cal.com, Calendly |

- **One service per job:** when two connected services can do the same job (Zendesk and HubSpot both open tickets), the owner picks which one does it.
- **Switches and confirmation:** each job can be switched off, and can ask the visitor to confirm first. Booking asks by default.
- **Limits per conversation:** 3 Slack posts, 2 tickets, 2 leads and 2 bookings.
- **Visitor's email:** a signed-in visitor's own email always wins over one typed in the chat.
- **Follow-ups:** when Slack is connected, follow-up requests are posted to its channel too. The owner can switch that off.

**How it's built.** The code is in `src/lib/integrations`:

- `catalog.ts`: the services and their forms.
- `capabilities.ts`: the jobs.
- `providers/`: one adapter per service.
- `store.ts`: connections, with secrets encrypted with `ENCRYPTION_KEY`.

Two generic routes run OAuth for every service: `/api/integrations/<service>/connect` and `/callback`. Register `<NEXT_PUBLIC_APP_URL>/api/integrations/<service>/callback` as the redirect URL wherever a service asks for one. Without a service's client ID and secret, its card says what's missing and offers the other way to connect, where there is one.

**Setup for each service:**

- **Stripe:** customers install our Stripe App, which asks only for the permissions in [`integrations/stripe-app/stripe-app.json`](integrations/stripe-app/stripe-app.json), or paste a restricted key. The page lists the key's permissions.
  - **The app:** upload it to your *live* Stripe account (not a sandbox) with the Stripe CLI and its apps plugin: `stripe login`, then `stripe apps upload` in `integrations/stripe-app`. Stripe has to review and publish it before other accounts can install it; until then, use the test links on its External test tab.
  - **Live installs:** set `STRIPE_APP_INSTALL_URL` to the app's OAuth link (Settings tab). Codes are exchanged with `STRIPE_APP_SECRET_KEY`, or `STRIPE_SECRET_KEY` when that's unset.
  - **Sandbox installs:** set `STRIPE_APP_SANDBOX_INSTALL_URL` to the sandbox OAuth link and `STRIPE_APP_SANDBOX_SECRET_KEY` to the secret key of the app's managed sandbox, which Stripe creates for it. Customers then also get "Connect a sandbox".
  - **Tokens:** access tokens last an hour and are refreshed on use; refresh tokens change on every refresh and last a year.
  - **Which customer:** the site's identity token should carry `stripe_customer_id`. Matching the signed-in user by email is a per-assistant opt-in, because it's only safe when the site verifies emails.
  - **Billing portal:** links only work once the customer has saved their portal settings in Stripe.
- **Slack:**
  - Create the app from [`integrations/slack-app-manifest.yml`](integrations/slack-app-manifest.yml) and set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`.
  - Slack only accepts https redirect URLs. To try it locally, run `npm run dev:https` (a self-signed certificate for https://localhost:3010) with `NEXT_PUBLIC_APP_URL=https://localhost:3010`, then run `npm run app-assistant` again so the help assistant allows the new address.
  - Upload `integrations/app-icon-1024.png` as the app icon.
  - For other workspaces to install it, turn on public distribution. That needs no Slack Marketplace review.
- **Zendesk:** nothing to set up here.
  - Each customer creates an OAuth client in their own Zendesk (Admin Center > Apps and integrations > APIs > OAuth clients) with our callback URL, then pastes their subdomain, the client's identifier and its secret, and approves access. The page walks them through it.
  - The client's credentials are stored encrypted with the tokens.
  - Zendesk refresh tokens expire after 90 days unused, so the daily worker (`/api/knowledge/worker`) refreshes any Zendesk connection, and any Stripe app connection, that hasn't refreshed for a month (`src/lib/integrations/keep-alive.ts`).
- **Salesforce:**
  - New Salesforce integrations are External Client Apps, which only work in the org that created them.
  - **Customer's own app:** the customer's admin creates one with our callback URL and pastes its consumer key and secret. The page walks them through it. This works with no setup here.
  - **Our app:** for a one-click button, package an External Client App in a second-generation managed package and set `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`.
- **HubSpot:**
  - Customers can paste a service key. The page lists its scopes.
  - For a Connect button, create an app in a HubSpot developer account with the callback and set `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET`.
  - An OAuth app can only be installed in 25 accounts until it's listed on HubSpot's marketplace.
- **Cal.com:**
  - **Connect with Cal.com:** create an OAuth client at `app.cal.com/settings/developer/oauth` with the callback and the scopes `PROFILE_READ`, `EVENT_TYPE_READ`, `BOOKING_READ` and `BOOKING_WRITE`, and set `CALCOM_CLIENT_ID` and `CALCOM_CLIENT_SECRET`. A Cal.com admin reviews new clients before they work. Access tokens last 30 minutes and are refreshed; the daily worker keeps unused connections alive.
  - **Without it, or for self-hosted Cal.com:** customers paste an API key (plus the API address for self-hosted). The steps tell them to pick Never expires.
- **Calendly:**
  - **Connect with Calendly:** create an OAuth app at developer.calendly.com (kind Web) with the callback and the scopes `users:read`, `event_types:read` and `scheduled_events:write`, and set `CALENDLY_CLIENT_ID` and `CALENDLY_CLIENT_SECRET`. Calendly separates environments: a Sandbox app allows `localhost` redirect URLs for development, and a second, Production app (https only) serves the live site. Each refresh token works once; the daily worker keeps unused connections alive.
  - **Without it:** customers can paste a personal access token.
  - **Booking** through the API needs a paid Calendly plan. On a free plan, or when the meeting type needs details only the visitor can give (like a phone number), the assistant sends a link to the time they picked, with their name and email filled in.

## Local setup

Requires Node 22+, Docker and the Supabase CLI.

```bash
npm install
supabase start                 # ports 55421–55427, see supabase/config.toml
cp .env.example .env.local     # fill in keys; Supabase keys come from `supabase status`
npm run dev                    # http://localhost:3010
```

Sign-in codes land in Mailpit at http://127.0.0.1:55424. Your first sign-in creates a workspace.

Google sign-in works locally once `.env` (read by the Supabase CLI, not by the app) has `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` from a Google Cloud OAuth client whose authorized redirect URIs include `http://127.0.0.1:55421/auth/v1/callback`. Restart Supabase after adding them (`supabase stop && supabase start`). Without them the sign-in page just doesn't offer Google. Create an assistant and open its **Playground** to talk to it. Run `npm run app-assistant` to add the dashboard's help assistant.

`npm run db:reset` re-applies `supabase/migrations` and wipes local data.

### Voice

Calls only need `ELEVENLABS_API_KEY`, with Text to Speech and Speech to Text access. Nothing has to be reachable from the internet, so they work on localhost as they are. The voice and language are set per assistant.

### Environment

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app. Baked into `/embed.js` at build time. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | From `supabase status` locally. |
| `GOOGLE_API_KEY` | Gemini, for chat, embeddings and transcribing calls. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Claude and GPT models. `ANTHROPIC_API_KEY` runs the default model, Claude Haiku 5.5; without it, assistants answer with Gemini 3.8 Flash. Without a key, that provider's models can't be picked. |
| `ELEVENLABS_API_KEY` | Calls: the assistant's voice, and backup speech-to-text (Scribe). Without it the widget is text-only. |
| `WIDGET_SESSION_SECRET`, `ENCRYPTION_KEY` | 32+ random characters each. Changing `ENCRYPTION_KEY` makes stored integration keys, tokens and header values unreadable. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Rate limits fall back to in-memory without them. |
| `NEXT_PUBLIC_EDITION` | `cloud` for the hosted service (plans, billing, marketing site). Unset for self-hosted. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Optional. Sends follow-up emails and invitations, and in the cloud edition the welcome and subscription emails (`src/lib/emails`). |
| `STRIPE_SECRET_KEY` | Your Stripe account: billing (cloud) and the platform side of "Connect with Stripe". |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Cloud. Signing secret of the `/api/billing/webhook` endpoint. |
| `STRIPE_APP_INSTALL_URL`, `STRIPE_APP_SECRET_KEY`, `STRIPE_APP_SANDBOX_INSTALL_URL`, `STRIPE_APP_SANDBOX_SECRET_KEY` | Optional. "Connect with Stripe" for customers, through your Stripe App (see "Integrations"). |
| `SLACK_`, `SALESFORCE_`, `HUBSPOT_`, `CALENDLY_` + `CLIENT_ID`, `CLIENT_SECRET` | Optional. OAuth apps for those integrations (see "Integrations"). |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated emails that can open `/admin/costs`. |
| `CRON_SECRET` | Protects the cron routes, `/api/knowledge/worker` and `/api/billing/refill` (Vercel Cron sends it). Without it, a key derived from `WIDGET_SESSION_SECRET` is used, which Vercel Cron can't send. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Optional. Telegram alerts for the team: sign-ups, subscriptions, cancellations, and errors in server actions, webhooks, crons and pages (`src/lib/notify.ts`, `src/instrumentation.ts`, `src/app/error.tsx`). Messages carry ids, never emails. |
| `KNOWLEDGE_BROWSER`, `BROWSER_WS_ENDPOINT`, `CHROMIUM_PATH` | Where pages built in the browser are rendered (see "Knowledge"). |
| `NEXT_PUBLIC_APP_ASSISTANT_ID`, `APP_ASSISTANT_WORKSPACE_ID` | The dashboard's help assistant (`npm run app-assistant` prints the ID). Optional. |
| `KNOWLEDGE_AUTO_REFRESH_DAYS` | Self-hosted. How often website pages are re-read automatically (default 7, 0 turns it off). |
| `NEXT_PUBLIC_DEMO_AGENT_ID` | Optional. A live assistant for the landing page demo bubble. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional. Google Analytics (`src/components/consent`): on the marketing site only after a visitor allows it in the cookie banner, in the dashboard for everyone signed in. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Cloud, optional. PostHog analytics and session recordings in the dashboard (`src/components/dashboard/product-analytics.tsx`). Recordings mask inputs and anything inside a `ph-mask` element: visitors' conversations, insights, emails. |
| `ALLOW_PRIVATE_URLS` | Development only. Lets actions and imports reach localhost. |

## Layout

```
src/app/(web)              landing page (cloud edition only)
src/app/(dashboard)        workspaces, members, billing and assistant settings
src/app/invite/[token]     accepting an invitation
src/app/widget/[agentId]   the iframe UI (home, call, chat)
src/app/embed.js           the loader script
src/app/api/widget/*       session, chat stream, call start, spoken turns, page updates, end
src/components/widget/voice  mic worklet, speech-to-text sockets (Gemini, Scribe), speech player, turn-taking, the call itself
src/lib/runtime            prompt, tools, history, confirmations, the turn loop
src/lib/voice              ElevenLabs sockets, sentence chunking, spoken turns, interruptions
src/lib/knowledge          discovery, reading and rendering pages, chunking, embeddings, search, the background worker
src/lib/actions            HTTP and Stripe execution, SSRF guard
src/lib/integrations       Slack, Zendesk, Salesforce, HubSpot, Cal.com and Calendly: connections and adapters
src/lib/billing            plan state, limits, Stripe subscriptions (cloud)
src/lib/workspaces         invitations, workspace names
src/server-actions         dashboard mutations
```

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```

## Known gaps

- Calls have been tested in headless Chrome with a fake microphone (turns, page changes and barge-in), not yet with a real mic and speakers. Echo handling relies on the browser's echo cancellation plus a transcript check; tune it on real hardware.
- After a full page load the call reconnects automatically, but some browsers block audio until the user taps "Continue the call".
- The SSRF guard checks resolved addresses before each request but doesn't pin them, so DNS rebinding is still possible. Pin the address in an undici dispatcher before running untrusted actions in production.
- The Slack, Zendesk, Salesforce, HubSpot, Cal.com and Calendly adapters have been tested against mocked APIs, not yet live accounts.
- Plan limits cover assistants, seats, messages, knowledge and site map pages; the per-plan feature switches (actions, Stripe, identity) aren't enforced yet.

## License

Copyright © 2026 Accelerated Ideas OÜ. Licensed under [AGPL-3.0](LICENSE). If you run a modified version as a service for others, you have to offer its source code to its users. For a commercial license without the AGPL's terms, email hello@useoriel.com.

- **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md). Contributors sign the [CLA](CLA.md) once, so contributions can be offered under both licenses.
- **Name and logo:** not covered by the license; see [TRADEMARKS.md](TRADEMARKS.md).
- **Security:** report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
