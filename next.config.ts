import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Pack artwork on /releases is served straight from Pinter's Shopify CDN.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
    ],
  },
};

export default nextConfig;
