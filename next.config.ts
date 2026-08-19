import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No remotePatterns on purpose. Every image this app renders is local, in
  // line with the data and image policy in docs/DEVELOPMENT.md: official
  // BrewPack artwork is Pinter's and is neither reproduced nor hotlinked.
};

export default nextConfig;
