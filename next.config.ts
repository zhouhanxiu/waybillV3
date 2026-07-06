import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  // 注意：不要在 Vercel 上排除 .pnpm，否则运行时可能丢失依赖
  turbopack: {},
};

export default nextConfig;
