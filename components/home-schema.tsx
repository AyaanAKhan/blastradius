import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export function HomeSchema() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${absoluteUrl("/")}#website`,
        url: absoluteUrl("/"),
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en-US",
      },
      {
        "@type": "Organization",
        "@id": `${absoluteUrl("/")}#organization`,
        name: SITE_NAME,
        url: absoluteUrl("/"),
        logo: absoluteUrl("/favicon.svg"),
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${absoluteUrl("/")}#application`,
        name: SITE_NAME,
        url: absoluteUrl("/analyze"),
        description: SITE_DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any modern web browser",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Unified diff parsing",
          "Reverse dependency traversal",
          "Affected surface identification",
          "Related test matching",
          "Transparent review-attention scoring",
          "Optional local-model narration",
        ],
        provider: { "@id": `${absoluteUrl("/")}#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replaceAll("<", "\\u003c") }}
    />
  );
}
