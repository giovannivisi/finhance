import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim();
const themeScriptHash =
  "'sha256-0sz8XWenEQYegE5RSoh9Y2TjZS3c0u/2EpkpVIim/CU='";

// Browsers ignore Strict-Transport-Security over plain HTTP, so serving these
// in local development is harmless.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' ${themeScriptHash}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
