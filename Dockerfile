# Next.js (standalone) production image for Fly.io

FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps: fresh install from package.json (registry reachable on the builder) ---
FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# --- build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime: only the standalone server + static assets ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
