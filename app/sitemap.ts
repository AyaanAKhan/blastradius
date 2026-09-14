import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/analyze"), changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/method"), changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/sources"), changeFrequency: "monthly", priority: 0.7 },
  ];
}
