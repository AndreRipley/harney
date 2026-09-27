import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor's port preview and other localhost hosts need to be allowed for HMR/assets.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
