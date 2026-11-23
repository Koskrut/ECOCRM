import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trailing-slash 301s are decided in middleware so /shop/ can go straight to /systems.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
