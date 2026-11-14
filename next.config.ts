import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This dashboard is authenticated and reads live PostgreSQL data on every
  // request, so it intentionally uses the per-request rendering model rather
  // than Cache Components' prerendered shells.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
