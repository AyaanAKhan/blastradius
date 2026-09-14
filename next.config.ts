import type { NextConfig } from "next";

const pagesBuild = process.env.PAGES_BUILD === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

const nextConfig: NextConfig = {
  agentRules: false,
  output: pagesBuild ? "export" : undefined,
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  productionBrowserSourceMaps: false,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
