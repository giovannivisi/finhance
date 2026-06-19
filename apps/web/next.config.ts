import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim();
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
].join(" ");

// Browsers ignore Strict-Transport-Security over plain HTTP, so serving these
// in local development is harmless.
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next App Router emits inline bootstrap and RSC scripts. Without a nonce
  // pipeline, blocking inline scripts leaves pages visible but unhydrated.
  // React also needs eval in development for debugging call stacks.
  `script-src ${scriptSrc}`,
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
