import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,  // STAGE-6-FIX: was true — all 86 TS errors now fixed
  },
  reactStrictMode: true,  // STAGE-6-FIX: was false — enables double-invoke bug detection in dev
};

export default nextConfig;
