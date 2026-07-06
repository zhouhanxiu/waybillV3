import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  turbopack: {},
  outputFileTracingExcludes: {
    "*": [
      "node_modules/.pnpm/**",
      ".next/**",
    ],
  },
};

export default nextConfig;
