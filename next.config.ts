import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true, // STAGE-6-FIX: was false — enables double-invoke bug detection in dev
};

export default nextConfig;
