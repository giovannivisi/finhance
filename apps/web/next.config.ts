import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim();

// Browsers ignore Strict-Transport-Security over plain HTTP, so serving these
// in local development is harmless.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  devIndicators: false,
  ...(distDir ? { distDir } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
