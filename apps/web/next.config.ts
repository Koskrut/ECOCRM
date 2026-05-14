import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      /** Fixes mistaken relative URLs when the app is served under `/api/` (e.g. `api/system/...` → `/api/api/...`). */
      { source: "/api/api/:path*", destination: "/api/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
