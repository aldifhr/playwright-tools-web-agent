import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // anydoc ships a native (napi) binary — never bundle it, load at runtime.
  serverExternalPackages: ["@firecrawl/anydoc"],
};

export default nextConfig;
