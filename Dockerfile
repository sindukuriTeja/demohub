# ─────────────────────────────────────────────────────────────────────────────
# DemoHub — Multi-stage Dockerfile for Next.js 14 (App Router) + Prisma
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only manifest files first (better layer caching)
COPY package.json package-lock.json* ./

# Install ALL dependencies (prisma CLI is needed for build-time generate + migrate)
RUN npm ci

# ── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy source
COPY . .

# Generate Prisma client during build (needed for build-time types & static gen)
RUN npx prisma generate

# Build the Next.js app (output: standalone is set in next.config.mjs)
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Don't run as root for security
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy the standalone output — this includes a minimal node_modules with only
# production deps needed to run Next.js (server.js + .next/standalone).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma client generated at build time — the standalone node_modules does NOT
# include @prisma/client's generated client, so copy it explicitly.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy the Prisma schema + migrations (needed by entrypoint to run migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose the port Next.js listens on
EXPOSE 3000

# Environment defaults
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

# Entrypoint runs migrations then starts Next.js
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
