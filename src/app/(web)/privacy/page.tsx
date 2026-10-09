import type { Metadata } from "next";
import Link from "next/link";
import { ANALYTICS_ENABLED } from "@/config/analytics";
import { BRAND } from "@/config/brand";
import { LEGAL, LEGAL_UPDATED_AT } from "@/config/legal";
import { LegalPage, type LegalSection } from "@/components/web/legal/legal-page";
import { JsonLd, pageMetadata, webPage } from "@/components/web/seo";

const DESCRIPTION = `What the hosted ${BRAND.name} service collects, why, and who it shares it with.`;

export const metadata: Metadata = pageMetadata({ title: "Privacy policy", description: DESCRIPTION, path: "/privacy" });

// Written from what the code does: src/app/api/widget/session (what's stored
// per conversation), src/lib/widget/embed-script.ts (browser storage), the
// providers in README "Stack", and src/components/consent (analytics, only
// described once NEXT_PUBLIC_GA_MEASUREMENT_ID is set). Update it when those change.
const PROVIDERS = [
  { name: "Supabase", use: "Our database, and sign-in" },
  { name: "Anthropic (Claude API)", use: "Writing answers, unless an assistant is set to use another model" },
  { name: "Google (Gemini API)", use: "Turning call audio into text, summaries and insights, searching knowledge, and writing answers for assistants set to use Gemini or when another model fails" },
  { name: "OpenAI (API)", use: "Writing answers for assistants set to use GPT, without OpenAI keeping the conversation" },
  { name: "ElevenLabs", use: "Turning replies into speech, and call audio into text when Google can't" },
  { name: "Stripe", use: "Payments for your plan" },
  { name: "Resend", use: "Invitation and follow-up emails" },
  { name: "Upstash", use: "Rate limiting, to keep the service from being abused" },
  { name: "Vercel", use: "Hosting the app and website" },
  ...(ANALYTICS_ENABLED
    ? [{ name: "Google Analytics", use: "Measuring visits to our website if you allow it, and how the dashboard is used, without cookies unless you allow them" }]
    : []),
];

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.company} (&ldquo;we&rdquo;), a company registered in {LEGAL.country}, runs the hosted {BRAND.name} service. This policy explains what we collect, why,
          and what you can do about it. It covers our website, the dashboard, and the assistants our customers put on their own
          sites.
        </p>
        <p>We have two roles:</p>
        <ul>
          <li>
            <strong>For our customers&apos; accounts</strong>, the people who sign in to {BRAND.name} to build assistants, we
            decide how data is used.
          </li>
          <li>
            <strong>For our customers&apos; visitors</strong>, the people who talk to an assistant on a customer&apos;s site, we
            handle data on that customer&apos;s behalf and follow their instructions. Their privacy notice applies too. If you
            talked to an assistant on someone&apos;s site, they&apos;re the best people to ask about your data, and we&apos;ll
            help them answer.
          </li>
        </ul>
        <p>
          {BRAND.name} is also open source. If an organization runs it on its own servers, we never see that data and this
          policy doesn&apos;t apply to it.
        </p>
      </>
    ),
  },
  {
    id: "customers",
    title: "What we collect from customers",
    body: (
      <ul>
        <li>
          <strong>Your account:</strong> your email address, which you use to sign in, and the workspaces you belong to and your
          role in them. If you sign in with Google, Google shares your name, email address and profile picture with us. When you
          invite someone, we keep their email address and the invitation.
        </li>
        <li>
          <strong>Billing:</strong> Stripe takes your payment details, billing name, address and tax ID. We keep only Stripe&apos;s
          references to your customer and subscription, and your plan&apos;s status. We never see your full card number.
        </li>
        <li>
          <strong>What you add:</strong> your assistants&apos; settings, the knowledge you give them, their site maps and the
          actions you set up. Files are turned into text and the originals aren&apos;t kept. Website pages are fetched from your
          site. API keys and headers for your actions, and your Stripe connection, are encrypted before we store them.
        </li>
        <li>
          <strong>Help in the dashboard:</strong> conversations with the dashboard&apos;s help assistant, which can read the
          visible text and links of the page you&apos;re on to answer you.
        </li>
        <li>
          <strong>Usage:</strong> counts such as conversations, messages and call minutes, and records of the AI and voice
          services each one used. These don&apos;t include what was said.
        </li>
        <li>
          <strong>Support:</strong> what you send us when you get in touch.
        </li>
      </ul>
    ),
  },
  {
    id: "visitors",
    title: "What assistants handle for customers",
    body: (
      <>
        <p>When someone talks to an assistant on a customer&apos;s site, we process the following on the customer&apos;s behalf:</p>
        <ul>
          <li>
            <strong>The conversation:</strong> what the visitor types, what they say on calls as text, the assistant&apos;s
            replies, and the actions it took with their results. Results can include details from the customer&apos;s systems,
            such as billing information from their Stripe account.
          </li>
          <li>
            <strong>Call audio:</strong> sent straight from the visitor&apos;s browser to Google, or to ElevenLabs when Google
            can&apos;t take the call, to be turned into text, while the reply is turned into speech by ElevenLabs. We don&apos;t
            record or store call audio.
          </li>
          <li>
            <strong>The page:</strong> the address and title of the page the visitor is on. If the customer turns on &ldquo;Read
            the current page&rdquo;, which is on by default, also its visible text and links, so answers match what the visitor sees. We
            keep the most recent page with the conversation.
          </li>
          <li>
            <strong>Who they are:</strong> if the customer signs visitors in, the details their server shares, such as an ID,
            name, email address and any other attributes, and their Stripe customer reference.
          </li>
          <li>
            <strong>Technical details:</strong> a random ID kept in the browser, the browser and device type, the visitor&apos;s
            country, the referring page and the site the assistant is on. IP addresses are used briefly to limit how many
            conversations can start, and aren&apos;t stored with conversations.
          </li>
          <li>
            <strong>What the assistant writes about the conversation:</strong> a title, a summary and a sense of how it went. It
            also notes feedback for the customer&apos;s team, such as a bug the visitor hit, which can include their email address
            and the page. When it asks the customer&apos;s team to follow up, it sends a summary and the visitor&apos;s
            contact details by email or to the customer&apos;s own systems.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <ul>
          <li>to run the service: answering, speaking, searching knowledge, and taking the actions customers turn on</li>
          <li>to sign you in, bill your plan and send the emails the service needs, like invitations and follow-up requests</li>
          <li>to keep the service secure and protect it from abuse</li>
          <li>to support you, and to understand our costs and fix problems</li>
          {ANALYTICS_ENABLED && (
            <li>to see how people find and use our website (if you allow it) and how the dashboard is used, so we can improve them</li>
          )}
          <li>to meet our legal obligations, such as keeping tax records</li>
        </ul>
        <p>
          We don&apos;t sell personal data, show ads, or use your content or your visitors&apos; conversations to train AI models.
        </p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Legal bases",
    body: (
      <p>
        Where laws like the GDPR apply, we rely on our contract with you to provide the service, on our legitimate interests to keep
        it secure and improve it{ANALYTICS_ENABLED && ", including measuring how the dashboard is used without cookies"}, on legal
        obligations for records like invoices, and on consent where we ask for it{ANALYTICS_ENABLED && ", such as for analytics cookies"}.
        For visitors&apos; data, the customer whose site they used decides the legal basis.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We use these providers to run {BRAND.name}. They handle data only to provide their service to us:</p>
        <ul>
          {PROVIDERS.map((provider) => (
            <li key={provider.name}>
              <strong>{provider.name}:</strong> {provider.use}
            </li>
          ))}
        </ul>
        <p>
          When a website page only shows its content in a browser, we may load it in a hosted browser service to read it.
        </p>
        <p>
          Assistants also send data to the systems their owner connects, such as the customer&apos;s own API, webhooks or Stripe
          account. The customer chooses those, and their own policies apply.
        </p>
        <p>
          We may disclose data if the law requires it, and if our company is sold or merged, data would pass to the new owner under
          this policy.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where data goes",
    body: (
      <p>
        We&apos;re based in the European Union. Our providers process data there, in the United States and in other countries.
        When data leaves the European Economic Area, the UK or Switzerland, we rely on safeguards such as the European
        Commission&apos;s standard contractual clauses, or on the provider&apos;s certification under the EU-US Data Privacy
        Framework, as with Google.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>
          Workspaces, assistants and conversations are kept while the workspace exists, including after a plan ends, so you can
          come back. Ask us to delete them at any time.
        </li>
        <li>Knowledge, site maps and actions are deleted when you remove them in the dashboard.</li>
        <li>Billing and usage records are kept as long as tax and accounting rules require.</li>
        <li>Rate-limiting records expire within minutes.</li>
        {ANALYTICS_ENABLED && <li>Google Analytics keeps what it measures for 14 months.</li>}
      </ul>
    ),
  },
  {
    id: "storage",
    title: "Cookies and browser storage",
    body: (
      <>
        <p>
          {ANALYTICS_ENABLED
            ? "Our website and dashboard use what they need to work, and analytics cookies only if you allow them. The dashboard also measures how it's used without cookies. We never use advertising cookies."
            : "Our website and dashboard use cookies only to keep you signed in. We don't use analytics or advertising cookies."}
        </p>
        <ul>
          <li>
            <strong>Signing in:</strong> cookies that keep you signed in to the dashboard, until you sign out or for up to 400
            days.
          </li>
          {ANALYTICS_ENABLED && (
            <>
              <li>
                <strong>Your cookie choice:</strong> kept in your browser&apos;s storage as <code>{BRAND.messagePrefix}:consent</code>,
                so we don&apos;t ask on every page. We ask again after 6 months.
              </li>
              <li>
                <strong>Google Analytics cookies, only if you allow them:</strong> <code>_ga</code> and <code>_ga_&hellip;</code>,
                which count visits and how people move around our website and dashboard, for up to 13 months. Google doesn&apos;t
                store your IP address, and its advertising features and Google signals are off.
              </li>
              <li>
                <strong>Google Analytics without cookies, in the dashboard:</strong> until you choose, the dashboard tells Google
                Analytics which pages are viewed and what&apos;s clicked, without cookies or any ID stored on your device, so Google
                can only estimate visits. Choosing Don&apos;t allow stops it.
              </li>
            </>
          )}
        </ul>
        {ANALYTICS_ENABLED && (
          <p>
            On our website nothing optional runs until you choose. Change your mind any time with Cookie settings at the bottom of
            every page of our website or in your account menu in the dashboard; if you turn analytics off, we remove its cookies and
            stop measuring. If your browser sends a Global Privacy Control signal, we treat it as a no.
          </p>
        )}
        <p>
          On customers&apos; sites, the assistant sets no cookies. It uses the browser&apos;s storage on that site to remember a
          random visitor ID, the current conversation (so it can pick up again within 12 hours), how the assistant looks, and a call
          in progress across page loads. These stay until the browser&apos;s site data is cleared. The assistant on our own
          website works the same way.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data travels over encrypted connections. API keys, request headers and Stripe connections are encrypted with AES-256 before
        we store them. Assistants can be limited to their owner&apos;s domains, and visitors who are signed in are verified with
        tokens signed by the customer&apos;s server. No system is perfectly secure, so if you find a problem, please tell us.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>
          Depending on where you live, you can ask to see, correct, delete or export your personal data, to object to how we use
          it or have us limit it, and to withdraw consent. To ask, email {LEGAL.email}. We&apos;ll reply within a month. You
          can also complain to your local data protection authority, or to ours, {LEGAL.dataProtectionAuthority}.
        </p>
        <p>
          If you talked to an assistant on someone else&apos;s site, ask that business first; we&apos;ll help them with your
          request. California residents: we don&apos;t sell or share personal information for advertising.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        {BRAND.name} isn&apos;t meant for children, and customers agree not to use it to collect data from anyone under 16. If you
        think a child has given us data, email {LEGAL.email} and we&apos;ll delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We&apos;ll update this page when we change how we handle data, and email workspace owners about significant changes before
        they take effect. Our <Link href="/terms">terms of service</Link> explain the rest of our agreement with customers.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        {LEGAL.company} (registry code {LEGAL.registryCode}), {LEGAL.address}. Email{" "}
        {LEGAL.email} for anything about privacy, including data processing agreements.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <JsonLd graph={[webPage({ path: "/privacy", name: "Privacy policy", description: DESCRIPTION, updated: LEGAL_UPDATED_AT })]} />
      <LegalPage
        title="Privacy policy"
        updated={LEGAL.updated}
        sections={SECTIONS}
      />
    </>
  );
}
