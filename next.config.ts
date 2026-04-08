import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content Security Policy for AstraPlanner.
 *
 * Tuned for the current stack:
 *  - Next.js 16 App Router (needs 'unsafe-inline' for hydration scripts until
 *    nonces are wired through a custom middleware — see SECURITY §15).
 *  - Tailwind v4 + framer-motion + recharts / visx (need 'unsafe-inline' styles).
 *  - Supabase JS SDK (HTTPS + realtime WebSocket to *.supabase.co).
 *  - Anthropic Claude is only called server-side from route handlers, so the
 *    browser never needs a direct connect-src to api.anthropic.com.
 *
 * Inline-script / inline-style loopholes can be tightened later by moving to
 * strict-dynamic with per-request nonces. For now this is the strictest CSP
 * that is compatible with the existing client bundle without breaking it.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  {
    // HTTPS-only for two years, including subdomains. Not adding `preload`
    // because that requires an explicit opt-in on hstspreload.org.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    // Prevent MIME type sniffing, which can turn a text upload into a script.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Legacy equivalent of CSP frame-ancestors. Kept for older browsers.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Don't leak full URLs when users click out to third-party links.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Disable powerful browser features we never use.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    // Cross-origin isolation defaults — safe for an app that does not embed
    // untrusted content.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Content-Security-Policy",
    value: CSP_DIRECTIVES,
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route. Next.js handles _next/* static assets
        // separately; these headers do not interfere with them.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
