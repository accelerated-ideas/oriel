import type { Metadata } from "next";
import { appUrl, BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";
import type { SubscriptionPlan } from "@/config/plans";
import type { Question } from "@/components/web/landing/faq-questions";

// Search and sharing for the public site: each page's metadata, and the
// structured data (JSON-LD) that tells search engines and AI assistants what
// the product is, who makes it and what it costs.

export const SITE_DESCRIPTION = `${BRAND.name} is a voice assistant for your product. It answers questions, shows people around, takes actions for them, and tells you where they get stuck.`;

// A page's title, description, canonical address and link preview text. The
// preview picture comes from the opengraph-image.tsx next to the page.
export function pageMetadata({
  title,
  description,
  path,
}: {
  // A string goes through the layout's "… · Oriel" template.
  title: string | { absolute: string };
  description: string;
  path: string;
}): Metadata {
  const shown = typeof title === "string" ? `${title} · ${BRAND.name}` : title.absolute;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: BRAND.name, locale: "en_US", url: path, title: shown, description },
    twitter: { card: "summary_large_image", title: shown, description },
  };
}

type Thing = Record<string, unknown>;

const ORGANIZATION = appUrl("/#organization");
const WEBSITE = appUrl("/#website");
const SOFTWARE = appUrl("/#software");

// Who makes it and the site itself: on every page of the site.
export function siteGraph(): Thing[] {
  return [
    {
      "@type": "Organization",
      "@id": ORGANIZATION,
      name: BRAND.name,
      legalName: LEGAL.company,
      url: appUrl("/"),
      logo: { "@type": "ImageObject", url: appUrl("/logo.png"), width: 512, height: 512 },
      email: LEGAL.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: LEGAL.postal.street,
        addressLocality: LEGAL.postal.locality,
        addressRegion: LEGAL.postal.region,
        postalCode: LEGAL.postal.postalCode,
        addressCountry: LEGAL.postal.countryCode,
      },
      identifier: { "@type": "PropertyValue", propertyID: "Estonian business register code", value: LEGAL.registryCode },
      sameAs: [BRAND.repoUrl],
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE,
      url: appUrl("/"),
      name: BRAND.name,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": ORGANIZATION },
    },
  ];
}

// The product, with what it costs: free to run yourself, or a hosted plan.
export function softwareApplication(plans: SubscriptionPlan[]): Thing {
  return {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE,
    name: BRAND.name,
    url: appUrl("/"),
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Voice AI assistant",
    operatingSystem: "Web browser",
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    publisher: { "@id": ORGANIZATION },
    offers: [
      {
        "@type": "Offer",
        name: "Self-hosted",
        description: "Open source. Run it on your own servers, with every feature and no message limits.",
        price: 0,
        priceCurrency: "USD",
        url: BRAND.repoUrl,
      },
      ...plans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        description: plan.description,
        price: plan.price_config.price,
        priceCurrency: "USD",
        url: appUrl("/pricing"),
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: plan.price_config.price,
          priceCurrency: "USD",
          billingDuration: "P1M",
          unitText: "month",
        },
      })),
    ],
  };
}

export function faqPage(path: string, questions: Question[]): Thing {
  return {
    "@type": "FAQPage",
    "@id": appUrl(`${path}#faq`),
    mainEntity: questions.map((question) => ({
      "@type": "Question",
      name: question.q,
      acceptedAnswer: { "@type": "Answer", text: question.a },
    })),
  };
}

export function webPage({ path, name, description, updated }: { path: string; name: string; description: string; updated?: Date }): Thing {
  return {
    "@type": "WebPage",
    "@id": appUrl(`${path}#webpage`),
    url: appUrl(path),
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE },
    publisher: { "@id": ORGANIZATION },
    ...(updated && { dateModified: updated.toISOString().slice(0, 10) }),
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: BRAND.name, item: appUrl("/") },
        { "@type": "ListItem", position: 2, name, item: appUrl(path) },
      ],
    },
  };
}

// Structured data as a script tag. "<" is escaped so text in it can't close the tag.
export function JsonLd({ graph }: { graph: Thing[] }) {
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
