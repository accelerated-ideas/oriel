# {{product}} dashboard guide

{{product}} gives a website or app a voice assistant. Visitors click the bubble on the site and talk to it, or type. It answers from the knowledge you give it, takes people to the right page, points at things on the screen, and can take actions for them. This guide explains the dashboard where you set it up.

## Getting around

The sidebar on the left changes with where you are.

- On the dashboard home it shows Assistants, Usage and Members.
- Inside an assistant it shows that assistant's sections: Playground, Conversations, Insights, Knowledge, Site map, Actions, Integrations, Behavior and Install.
- The arrow in the top bar, left of the assistant's name, goes back to the list of assistants.
- The account card at the bottom of the sidebar opens a menu with Billing, Rename workspace, switching between workspaces, New workspace and Log out.

## Workspaces

A workspace holds your assistants, your team and your plan. Your first workspace is created when you sign up. You can create more from the account menu, for example one per client if you're an agency. Each workspace has its own members and its own billing. Switch between workspaces from the same menu.

## Assistants

Each assistant lives on one website or app, with its own knowledge, voice and actions.

- Clicking an assistant on the Assistants page opens its Playground.
- Create one with New assistant on the Assistants page. Give it a name (what it calls itself when it talks to visitors) and, optionally, your website. With a website, it reads up to 15 pages right away so it knows something from the start.
- The Live switch in the top bar turns the assistant on or off on your site. When it's off, the bubble doesn't show on your site.
- Playground, first in the sidebar, is where you try it.

## Playground

The Playground is where you try an assistant before visitors do. It shows the real assistant in a box on the page.

- Type to it, or press the phone button next to Send to talk to it.
- New conversation, under the box, starts over.
- Conversations from the Playground are marked as tests. There it doesn't move between pages or run your site's code, because it isn't on your site; it tells you what it would do instead.
- Beside the box are shortcuts to what shapes its answers: Knowledge, Actions, Site map, and Voice and language.

## Conversations

Every call and chat with an assistant, newest first, grouped by day.

- Search by topic, summary, name or email.
- Each conversation shows who it was (signed-in visitors show their name), call length, whether they typed, the number of messages, and whether the team was asked to follow up.
- Open one to read the summary and the full transcript, including the steps the assistant took, the pages the visitor moved between, and replies that were cut off when the visitor interrupted.
- The panel on the right shows the visitor: when they started, call time, their last page, country, device, and any details your site passed in.

## Insights

What visitors went through with your product, logged by the assistant during conversations: bugs they hit, features they asked for, places they got confused, complaints, praise, and signs they might leave. Follow-up requests for your team appear here too. Mark an insight resolved once it's dealt with; Show resolved brings resolved ones back into view. Insights are about your product and your visitors, not about the assistant.

## Knowledge

What the assistant knows about your product. It answers from this and says so when something isn't covered.

### Adding knowledge

- Website opens a panel with three tabs:
  - Crawl site finds pages under an address, from the site's llms.txt, its sitemap, or its links.
  - Sitemap finds every page a sitemap lists.
  - Single page adds one page and reads it right away.
- With Crawl site and Sitemap, it first finds pages, then you choose which to add: filter the list (for example /docs), tick or untick pages, or add them all. Only the pages you add are read. Choose more pages later from the import's menu.
- More options lets you exclude paths (starts with, ends with, contains, exact match, or wildcard), treat query parameters like ?page=2 as separate pages, turn on slow mode for sites that can't take much traffic, and set a maximum number of pages. One import can find up to 10,000 pages.
- Files: PDF, Word, Markdown, text, CSV or HTML, up to 8 MB each, 10 at a time.
- Note: write or paste anything it should know, such as a policy or an answer to a common question.

### How pages are read

Pages are read in the background, and the list updates as they finish. Pages that only show their content after JavaScript runs are opened in a browser automatically. Pages behind a login can't be read; add that information as a note or a file instead. Headings and tables are kept.

### Managing knowledge

- Filter sources by Websites, Files, Notes, Pinned or Failed, and search them.
- Tick sources to read them again or remove them together. Each import's menu can read all its pages again or remove them all.
- Pin to every reply puts a source in front of the assistant in every conversation, whatever the question. Use it for things like pricing. Pinned sources can add up to 30,000 characters.
- Small knowledge bases are given to the assistant in full. Larger ones are searched for each question, by meaning and by exact words.

### Refreshing pages

When your website changes, read its pages again. How often a page can be read again depends on the plan: once a week on the trial and Starter, once a day on Pro, once an hour on Premium. Pro also re-reads your site automatically every week, and Premium every day. Pages that haven't changed aren't processed again. A page that failed can always be retried.

## Site map

The places in your product the assistant can take people to, with what each is for and whether it needs a login. Add the pages people ask about most: settings, billing, integrations, key features. The assistant uses it to navigate visitors and to know where things are.

- Add page adds one page with a name, path and description.
- Import adds many at once. Paste links, one per line, or columns copied from a spreadsheet or CSV (name, link and description in any order), or load a file. From a sitemap reads a site's sitemap.xml, optionally only paths starting with something like /help, and puts the links in the list to check before adding. Pages without a name get one from their link, like "Api keys" for /settings/api-keys. "These pages need a login" marks them all as needing a login. Pages already in the site map are skipped.
- Descriptions are optional, but they help it match what people ask, for example "change my card" to Billing.
- Search the list, tick pages and remove them together, or select every page that matches a search.
- How many pages a site map holds depends on the plan. Articles, docs and blog posts belong in Knowledge instead: it reads them and can take people to them too.

## Actions

Things the assistant can do, not just answer.

- Built-in: taking people to pages, pointing at things on the screen, searching knowledge, logging feedback, and handing off to your team. Each can be turned off.
- Custom actions:
  - HTTP actions call your own API. Header values are stored encrypted.
  - Browser actions call functions your site registers with {{product}}("registerAction", ...), so the assistant can do things inside your app.
- An action can require a signed-in user, and can ask the visitor to confirm before it runs.

## Integrations

Connect the services your team already uses, so the assistant can act in them. Press Connect on a service to open a panel on the right with the steps; values to paste into the service have Copy buttons. A connected service shows what it's set to in one line, with a Configure button. Configure opens a panel with a link to the service, a test button where there is one (Send a test message for Slack, Create a test ticket for Zendesk), its settings, and what the assistant does with it: switch each job on or off, and for tickets, leads, bookings and billing changes, choose whether the visitor confirms first. Nothing changes until you press Save; Cancel or closing the panel drops the changes. A test uses what's saved, so it's off while there are unsaved changes. Disconnect is at the bottom of that panel.

- Email and Webhook: where follow-up requests go when the assistant can't resolve something, besides Insights and Slack. Nobody joins the conversation live; the assistant tells the visitor the team will follow up by email.
  - Email: press Set up and enter your team's address. Each request arrives with a summary, how to reach the visitor and a link to the conversation; when the visitor left an email, replying goes to them.
  - Webhook: press Set up and enter your endpoint. We POST the same as JSON, to open a ticket or ping a tool we don't connect to. Configure shows the JSON.
  - Both have a test button in Configure (Send a test email, Send a test request).
- Stripe: press Connect with Stripe and install the {{product}} app on Stripe's page, approving the permissions it lists. Or paste a restricted API key with the permissions shown. Connect a sandbox, when offered, is for trying it with test data.
  - The assistant can then look up a signed-in visitor's subscription, plan, renewal date and invoices, and help with billing changes.
  - It only works for visitors your site has identified, and only with their own Stripe customer: include stripe_customer_id in the identity token (see Install).
  - Find customers by email (in Configure): when your site doesn't send a customer ID, it matches the signed-in user's email instead. Only turn it on if your product verifies email addresses.
  - Change plan needs the plans it may switch people to: in Configure, press Choose plans.
  - Open billing portal needs the customer portal set up in Stripe (Settings, then Billing, then Customer portal).
  - Disconnecting stops the assistant using Stripe. To remove the app from Stripe as well, uninstall it under Installed apps in the Stripe Dashboard.
- Slack: press Connect with Slack and approve it. The card then asks you to choose a channel: press Configure and pick one. {{product}} doesn't create channels; for a private channel, invite the app to it in Slack first.
  - In Configure, choose when it posts: when someone needs a follow-up (the assistant couldn't help, or they asked for a person), and when the team should know about something (a hot lead, an upset customer, a bug).
- Zendesk: the assistant opens tickets for visitors, with their email as the requester, so your team replies by email.
  - To connect, press Connect on Zendesk. A Zendesk admin adds an OAuth client in Admin Center (Apps and integrations, then APIs, then OAuth clients) with the name, description, client kind (Confidential) and redirect URL shown in the panel, each with a Copy button.
  - Then enter your Zendesk address (yourcompany from yourcompany.zendesk.com), the client's identifier and secret, press Continue to Zendesk and approve access.
  - Create a test ticket in Configure makes an internal test ticket, so nobody gets an email; close it afterwards.
- Salesforce: the assistant opens cases for support questions and saves leads from sales conversations.
  - To connect, press Connect on Salesforce. A Salesforce admin creates an External Client App (Setup, External Client App Manager, New External Client App) with the name, callback URL and OAuth scopes shown in the panel, each with a Copy button, leaving the security options as they are. A new app can take a few minutes to start working.
  - Then enter your Salesforce address (the address you sign in at, or any Salesforce page's address from the browser), the app's consumer key and secret (in its Settings, OAuth Settings, Consumer Key and Secret), press Continue to Salesforce and allow access.
  - Create a test case in Configure opens a test case in your org; close it afterwards.
- HubSpot: press Connect on HubSpot, then Connect with HubSpot when it's offered, or paste a service key: in HubSpot, Settings, then Integrations, then Service Keys (it takes Developer Tools access), with the scopes the panel lists and copies. Create a test ticket in Configure checks it works.
  - The assistant opens tickets linked to the visitor's contact, and saves leads as contacts with a note.
  - In Configure, choose which pipeline and stage new tickets go to.
- Cal.com: press Connect on Cal.com, then Connect with Cal.com and approve access in Cal.com. Or paste an API key from Cal.com's Settings (API keys, New API key), choosing Never expires, or the assistant stops booking when the key runs out. Self-hosted Cal.com connects with an API key and its API address. Check open times in Configure looks up the next free slot without booking anything.
- Calendly: press Connect on Calendly, then Connect with Calendly and approve access. Or paste a personal access token (in Calendly: Integrations & apps, then API and webhooks). Check open times in Configure finds the next free slot without booking anything.
  - Booking inside the conversation needs a paid Calendly plan. On a free plan, the visitor gets a link to the time they picked instead.
- Cal.com and Calendly: in Configure, pick which event type the assistant books. It offers open times in the visitor's own time zone and asks them to confirm before booking.
- Two services that do the same job, like Zendesk and HubSpot for tickets: the job is handled by one of them. The other service's Configure panel shows where the job is done now, with a button to switch, like Use HubSpot.
- Each job runs at most a few times per conversation, so the assistant can't open a pile of tickets or bookings.
- Every ticket, lead and Slack post links to the conversation, so your team can read it.
- Conversations in the Playground are real: tickets, leads and bookings made there are created in the connected service.
- Disconnecting removes the assistant's access and its jobs from that service.

## Behavior

Each section has its own Save button, which appears once something in it changes, with Discard to undo.

- Identity: the assistant's name (required), your product name (optional; it can also learn about your product from Instructions and Knowledge) and your website.
- Opening line: the first thing it says when someone starts a call or opens the chat.
- Instructions: rules, tone and context it should always follow. Facts about your product belong in Knowledge.
- Voice: choose a voice and play samples. Language: calls listen and speak in this language; text chat follows the visitor's language.
- Model: the AI model that writes its replies, on calls and in chat. Choose Claude Haiku 5.5 (the default), Gemini 3.8 Flash or GPT-6 Luna.
  - Fallback: another model that answers instead if the first one fails or hasn't started replying after 12 seconds, so the visitor still gets an answer. It's Gemini 3.8 Flash unless you change it, and you can turn it off with No fallback.
  - A model that can't be picked shows which API key the server needs. On a self-hosted install, set ANTHROPIC_API_KEY for Claude or OPENAI_API_KEY for GPT.
- Conversation:
  - Allow typing lets visitors switch from voice to text.
  - Read the current page shares the visible text and links of the visitor's page, so answers match what they see and the assistant can open items listed there.
  - Dig into problems makes it ask follow-up questions when someone is stuck and log what it learns in Insights.

## Install

- Add the snippet: one script tag on your site, before the closing body tag.
- Identify signed-in users: your server signs a token with the assistant's identity secret, and your page passes it to {{product}}("identify", { token }). Identified users can use actions that need a signed-in user, such as Stripe. Rotate the secret here if it leaks.
- Connect it to your app: single-page apps can give the assistant their router with {{product}}("setNavigator", ...) so it moves between pages without a reload, and register in-page actions.
- Allowed domains: the bubble only loads on the sites listed. Leave it empty while testing.
- Appearance: the assistant's avatar, the launcher's button text, its position (left, center or right) and the accent color, with a preview. The avatar is an Orb (a glossy sphere), a Face (a friendly character) or a Hive (a cluster of dots). Visitors see it in the panel and on the launcher, and on a call it moves with the assistant's voice.
- "Powered by {{product}}": a small link under the assistant's text box. On the Premium plan, switch it off under Appearance and save.

## Calls

Visitors start a call by clicking the bubble, and can switch to typing at any time. They can talk over the assistant; it stops and listens. The text of its replies appears as it speaks. They can minimize the call and keep talking while they use the site; the bubble shows the assistant's voice moving while it speaks. The call carries on when the page changes.

## Usage

Conversations, messages and call minutes for the workspace, by month, per day and per assistant. Messages are what visitors send, by voice or text. The assistant's replies don't count, and neither does the goodbye that ends a conversation.

## Members

Invite people by email from Members on the dashboard home, as an Admin or a Member. Admins can also invite people, rename the workspace and manage billing; Members build and run assistants. The person who created the workspace is its Owner. Invitations last 14 days; copy an invitation's link to send it yourself, or revoke it. Each plan includes a number of seats, and pending invitations count toward them.

## Billing and plans

Billing is in the account menu at the bottom of the sidebar. It shows the current plan, the messages used until the next billing date, assistants and members against the plan's limits, and lets you change plan or open Invoices and payment.

- Trial: 14 days and 100 messages, everything except hiding "Powered by {{product}}", no card needed. Each person gets one trial.
- Starter, $39 a month: 1,000 messages a month, 1 assistant, 2 team members, knowledge up to about 400 pages, site maps of 200 pages.
- Pro, $99 a month: 3,000 messages a month, 3 assistants, 5 team members, site maps of 1,000 pages, plus custom actions, Stripe, and verified signed-in users.
- Premium, $299 a month: 10,000 messages a month, 10 assistants, 15 team members, knowledge up to about 8,000 pages, site maps of 5,000 pages, hiding "Powered by {{product}}", and priority support.
- Paying yearly gives two months free.

Messages renew every month on the billing date, the day the plan started. Yearly plans get their messages each month too, on the same day.

Changing plan asks to confirm first and says what happens:
- An upgrade, or moving from monthly to yearly, applies right away. The card is charged the new price for the rest of the billing period, minus what's left of the current plan, and the workspace gets the extra messages for the rest of the month.
- A cheaper plan, or moving from yearly to monthly, starts on the next billing date. Until then the current plan stays, and Billing shows the switch. Choosing Keep on the current plan cancels the switch.
- If the card is declined, nothing changes. Update it under Invoices and payment, then try again.

Invoices, the card on file and cancelling are under Invoices and payment. A cancelled plan stays active until the end of what's been paid for.

When the trial ends without a plan, or a workspace runs out of messages, assistants stop answering and their bubble is hidden until a plan is chosen or the messages renew on the billing date.
