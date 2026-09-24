import type { NextConfig } from "next";

// basePath lo maneja el builder de Webflow Cloud según el mount path.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.COSMIC_MOUNT_PATH || "",
  },
};

export default nextConfig;
