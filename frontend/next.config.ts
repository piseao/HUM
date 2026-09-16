import type { NextConfig } from "next";
const publicBackend = process.env.NEXT_PUBLIC_BACKEND_URL;
if (process.env.VERCEL) {
  if (process.env.NEXT_PUBLIC_ISOLATE_CLIENTS !== "true") {
    throw new Error(
      "Set NEXT_PUBLIC_ISOLATE_CLIENTS=true for the public test deployment.",
    );
  }
  if (!publicBackend || !publicBackend.startsWith("https://")) {
    throw new Error(
      "Set NEXT_PUBLIC_BACKEND_URL to the HTTPS backend origin before deploying.",
    );
  }
  const url = new URL(publicBackend);
  if (
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND_URL must be a public HTTPS origin without credentials or a path.",
    );
  }
}
const config: NextConfig = {
  distDir: process.env.HUM_DIST_DIR || ".next",
  devIndicators: false,
  turbopack: { root: process.cwd() },
  experimental: { proxyTimeout: 300_000, proxyClientMaxBodySize: "26mb" },
  async rewrites() {
    if (publicBackend) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/:path*`,
      },
    ];
  },
};
export default config;
