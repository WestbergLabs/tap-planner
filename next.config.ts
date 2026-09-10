import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No remotePatterns on purpose. Every image this app renders is local, in
  // line with the data and image policy in docs/DEVELOPMENT.md. BrewPack pack
  // shots used by /labels are captured to public/brewpacks/ by
  // `pnpm sync:images` and served from here -- never hotlinked from Pinter's
  // CDN, so no traffic of ours reaches their servers.
};

export default nextConfig;
