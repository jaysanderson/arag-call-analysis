/**
 * Next.js configuration.
 *
 * The security headers mirror the platform's `securityHeaders()` middleware so that HTML pages get
 * the same baseline as the `/api/v1` responses (which `lib/api.ts` sets per response). The CSP
 * allows the jsDelivr CDN because Redoc and Swagger UI are loaded from there by the platform's
 * `redocHtml`/`swaggerHtml` helpers, and `'unsafe-inline'` for scripts because Next's hydration
 * bootstrap is inline — tightening that needs nonce middleware and is tracked as a known gap in
 * docs/architecture/security-model.md.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Slim, self-contained server build for the Docker/Fly image.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        /**
         * Partner branding assets, served from the data volume by `app/branding/[...path]`.
         *
         * This entry must come AFTER the catch-all: Next applies every matching rule in order and
         * the last value for a header key wins. It exists because config-level headers REPLACE
         * anything a route handler sets, so the catch-all was overwriting the sandboxing policy
         * `app/branding/[...path]` emits — and an uploaded SVG, which is a document that can carry
         * script, then executed with this origin's cookies. An operator uploading their own logo
         * would have handed that logo script access to their own session.
         */
        source: "/branding/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
