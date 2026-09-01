import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * A chat UI renders model output and third-party marketplace data, so the
 * browser-side controls matter even though React escapes text by default.
 *
 * `script-src 'self' 'unsafe-inline'` is not a typo and not an oversight: the
 * Next.js App Router bootstraps with inline scripts, and locking those down
 * needs per-request nonces from middleware, which is more machinery than this
 * sample should carry. The comment is here so nobody reads the policy as
 * stronger than it is. `object-src 'none'` and `frame-ancestors 'none'` are the
 * parts that do real work.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  // The browser talks to this origin only; the OpenSea MCP call is server-side.
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Redundant with `frame-ancestors` for modern browsers, kept for older ones.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // The chat endpoint returns a live stream of a paid completion. Nothing
        // in it should be stored by a browser or a shared cache.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
