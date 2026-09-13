import type { Metadata } from "next";

export const SITE_NAME = "BlastRadius";
export const SITE_DESCRIPTION =
  "Trace a pull request through downstream modules, exposed surfaces, and related tests, then get an evidence-backed review plan.";
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_ORIGIN).toString();
}

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} pull-request impact map and review plan`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
