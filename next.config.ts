import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the browser tests run a second dev server with its own build folder (and storage)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // the dev badge sits over the bottom-left rail buttons: hide it for the browser tests only
  ...(process.env.NEXT_DIST_DIR === ".next-e2e" ? { devIndicators: false as const } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    cpus: Number(process.env.BUILD_CPUS || 2),
    webpackBuildWorker: false, 
  },
};

export default nextConfig;
