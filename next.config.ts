import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  // 限制 Turbopack 内存占用
  turbopack: {
    // 减少文件监听范围
  },
  // 排除不必要的目录，减少 Turbopack 编译范围
  outputFileTracingExcludes: {
    "*": [
      "node_modules/.pnpm/**",
      ".next/**",
    ],
  },
};

export default nextConfig;
