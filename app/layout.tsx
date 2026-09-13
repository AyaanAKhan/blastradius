import type { Metadata, Viewport } from "next";
import "./globals.css";

import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "BlastRadius | Pull-request impact analysis",
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  referrer: "origin-when-cross-origin",
  keywords: [
    "pull request impact analysis",
    "code review",
    "dependency graph",
    "test selection",
    "software engineering portfolio project",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "BlastRadius | Know what a pull request can break",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "BlastRadius pull-request impact map and review plan",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BlastRadius | Know what a pull request can break",
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
