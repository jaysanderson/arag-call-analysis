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
    ];
  },
};

export default nextConfig;
