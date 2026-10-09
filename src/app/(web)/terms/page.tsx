import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";
import { LegalPage, type LegalSection } from "@/components/web/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `The terms for using the hosted ${BRAND.name} service.`,
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "These terms",
    body: (
      <>
        <p>
          These terms are an agreement between you and {LEGAL.company} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), the company in{" "}
          {LEGAL.country} that runs {BRAND.name}. They cover the hosted {BRAND.name} service: the dashboard, the assistants you
          build in it, and the widget you add to your sites. If you use {BRAND.name} for a company or other organization, you
          accept these terms on its behalf, and &ldquo;you&rdquo; means that organization.
        </p>
        <p>
          {BRAND.name}&apos;s source code is also available under the GNU Affero General Public License v3.0. If you run it
          yourself, the license applies and these terms don&apos;t. These terms cover only the service we host.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and workspaces",
    body: (
      <>
        <p>
          You sign in with a code we email you, so anyone with access to your inbox can get into your account. Keep it secure,
          and tell us straight away if you think someone else has used your account.
        </p>
        <p>
          Your work lives in workspaces. Owners and admins can invite people, manage billing and change any assistant. You&apos;re
          responsible for everything done in your workspaces, including by the people you invite.
        </p>
        <p>You must be at least 18 and able to enter into a contract to use {BRAND.name}.</p>
      </>
    ),
  },
  {
    id: "plans",
    title: "Plans, trials and payment",
    body: (
      <>
        <ul>
          <li>
            <strong>Trial.</strong> New accounts get a 14-day trial with every feature and 100 messages, without a card. Each
            person gets one trial.
          </li>
          <li>
            <strong>Paid plans</strong> are billed in advance, monthly or yearly, through Stripe. They renew automatically until
            you cancel. Prices are in US dollars and don&apos;t include taxes, which we add where the law requires.
          </li>
          <li>
            <strong>Messages.</strong> Plans include a number of messages a month. A message is something a visitor sends, by
            voice or text. Replies, greetings and the goodbye that ends a conversation don&apos;t count.
          </li>
          <li>
            <strong>Limits.</strong> When a workspace uses up its messages, its assistants pause until the next month. We
            don&apos;t charge for going over. Other limits, like assistants and team members, are set by your plan.
          </li>
          <li>
            <strong>Changes.</strong> You can change plans at any time. The difference is prorated.
          </li>
          <li>
            <strong>Cancelling.</strong> You can cancel at any time. Your plan stays active until the end of the period
            you&apos;ve paid for, then your assistants stop answering. Fees already paid aren&apos;t refunded, except where the
            law requires it.
          </li>
          <li>
            <strong>Failed payments.</strong> If a payment fails, the service keeps running while Stripe retries. If it still
            can&apos;t be collected, your subscription ends.
          </li>
          <li>
            <strong>Price changes.</strong> We&apos;ll tell you at least 30 days before a price change, and it applies from your
            next renewal.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <>
        <p>
          You own what you put into {BRAND.name}: the knowledge you add, your settings and actions, and the conversations your
          visitors have with your assistants (&ldquo;your content&rdquo;). You give us permission to store, copy and process
          your content only as needed to run the service for you, including sending it to the providers listed in our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
        <p>
          We handle your visitors&apos; personal data on your behalf, as your processor, and only on your instructions. If you
          need a data processing agreement, email {LEGAL.email}.
        </p>
        <p>
          When you add a website as knowledge, we fetch its pages for you and respect its robots.txt. Only add sites you have the
          right to use.
        </p>
      </>
    ),
  },
  {
    id: "your-visitors",
    title: "Your responsibilities to your visitors",
    body: (
      <>
        <p>Your assistants talk to your customers on your behalf, so some things are up to you:</p>
        <ul>
          <li>
            <strong>Tell people it&apos;s an AI,</strong> and that conversations, including what they say on calls, are
            transcribed and kept. Get any consent the law requires where they are, such as for recording calls.
          </li>
          <li>
            <strong>Have a privacy notice</strong> that covers your assistant and the data it handles.
          </li>
          <li>
            <strong>Choose its actions with care.</strong> You decide what it can do in your systems and your customers&apos;
            accounts, and which actions need a yes first. You&apos;re responsible for the results of the actions you turn on.
          </li>
          <li>
            <strong>Sign people in correctly.</strong> Keep your assistant&apos;s identity secret private, and only sign tokens
            for the person who is actually signed in to your product.
          </li>
          <li>
            <strong>Only connect what you&apos;re allowed to.</strong> That includes Stripe accounts, API keys and endpoints.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>Don&apos;t use {BRAND.name} to:</p>
        <ul>
          <li>break the law, or help anyone else break it</li>
          <li>make people believe they&apos;re talking to a human, or impersonate a real person or organization</li>
          <li>
            give medical, legal, financial or emergency advice that people rely on without a qualified person involved
          </li>
          <li>collect sensitive data such as full card numbers, passwords, health records or government IDs</li>
          <li>target children, or collect data from anyone under 16</li>
          <li>send spam, or harass, threaten or deceive people</li>
          <li>probe, overload or get around the security or limits of our service</li>
          <li>resell access to the hosted service without our written agreement</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI answers and actions",
    body: (
      <>
        <p>
          Your assistants&apos; answers are written by AI models from the knowledge and settings you give them. They can be
          wrong, out of date or incomplete, even when they sound sure. Review how your assistant behaves before you put it in
          front of customers, and don&apos;t rely on it alone for decisions that matter.
        </p>
        <p>
          Your assistants only take the actions you&apos;ve turned on. Actions marked as needing a confirmation run only after the
          visitor says yes, but they still change real things in your systems.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Other services",
    body: (
      <p>
        {BRAND.name} relies on other providers, such as Google, Anthropic and OpenAI for AI models, ElevenLabs for voice and Stripe for payments, and it
        connects to services you choose, like your own Stripe account or API. Those services have their own terms. We&apos;re not
        responsible for services we don&apos;t run, or for changes to them that affect what {BRAND.name} can do.
      </p>
    ),
  },
  {
    id: "open-source",
    title: "Open source and our name",
    body: (
      <p>
        The source code is licensed under AGPL-3.0, and that license, not these terms, decides what you can do with the code. The
        license doesn&apos;t give you rights to the {BRAND.name} name or logo, which belong to {LEGAL.company}; the trademark
        policy in our repository explains how you can use them.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep {BRAND.name} running and your data safe, but we don&apos;t promise it will always be available or free of
        errors. We improve the service all the time, which can mean changing or removing features. If we remove something
        important to paid plans, we&apos;ll tell you in advance.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Suspension and ending",
    body: (
      <>
        <p>
          You can stop using {BRAND.name} at any time by cancelling your plan. We may suspend or close a workspace if it breaks
          these terms, if payment can&apos;t be collected, or if it puts our service or other people at risk. Where we can, we&apos;ll
          warn you first and give you a chance to fix the problem.
        </p>
        <p>
          When a plan ends, your assistants stop answering. We keep your workspace and its data so you can come back, until you
          ask us to delete it. To delete a workspace and everything in it, email {LEGAL.email}.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        Apart from what these terms say, {BRAND.name} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. As far as
        the law allows, we disclaim all other warranties, including that it will be fit for a particular purpose, accurate or
        uninterrupted.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <>
        <p>
          As far as the law allows, neither of us is liable for indirect or consequential losses, such as lost profits, revenue,
          data or goodwill. Our total liability for any claims about the service is limited to the amount you paid us in the 12
          months before the claim.
        </p>
        <p>Nothing in these terms limits liability that can&apos;t be limited by law.</p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Claims about your use",
    body: (
      <p>
        If someone makes a claim against us because of your content, the actions you turned on, how you used {BRAND.name}, or
        because you didn&apos;t give your visitors the notices or get the consents described above, you&apos;ll cover our
        reasonable costs and losses from that claim.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. If a change is significant, we&apos;ll email workspace owners or tell you in the dashboard at
        least 30 days before it takes effect. If you keep using {BRAND.name} after that, the new terms apply. If you don&apos;t
        agree with them, you can cancel.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of {LEGAL.governingLaw}. Disputes will be heard by {LEGAL.courts}, unless the law
        where you live gives you the right to bring them elsewhere.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        {LEGAL.company} (registry code {LEGAL.registryCode}), {LEGAL.address}. Email{" "}
        {LEGAL.email}.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated={LEGAL.updated}
      sections={SECTIONS}
      summary={
        <>
          <p>
            You own your content and your visitors&apos; conversations, and we only use them to run {BRAND.name} for you. Plans
            renew monthly or yearly, you can cancel any time, and you keep access until the end of what you&apos;ve paid for.
          </p>
          <p>
            You&apos;re responsible for telling your visitors they&apos;re talking to an AI and for the actions you let it take.
            This summary is for convenience; the terms below are what apply.
          </p>
        </>
      }
    />
  );
}
