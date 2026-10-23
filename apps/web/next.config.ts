import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone: the Docker image runs
  // `node server.js` with no node_modules install. proxy.ts and per-request
  // i18n need a server, so a static export is not an option.
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default withNextIntl(nextConfig);
