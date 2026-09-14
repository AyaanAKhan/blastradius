import type { MetadataRoute } from "next";

import { absoluteUrl, SITE_ORIGIN } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: new URL(SITE_ORIGIN).hostname,
  };
}
