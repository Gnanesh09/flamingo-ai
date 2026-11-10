import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/api-client-react"],
  outputFileTracingRoot: root,
  turbopack: { root },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.replit.dev",
    "*.repl.co",
    "*.replit.app",
    ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
  ],
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: "/resolve",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
