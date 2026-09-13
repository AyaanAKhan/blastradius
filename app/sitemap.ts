import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-09-12T00:00:00.000Z");
  return [
    { url: absoluteUrl("/"), lastModified: updated, changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/analyze"), lastModified: updated, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/method"), lastModified: updated, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/sources"), lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
  ];
}
