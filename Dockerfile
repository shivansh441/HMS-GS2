# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# GrandStay Enterprise Management System — Multi-Stage Production Dockerfile
# -----------------------------------------------------------------------------

# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit

# Copy source files and configuration
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/
COPY server.ts ./

# Compile production bundle
ENV NODE_ENV=production
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

LABEL org.opencontainers.image.title="GrandStay Hybrid HMS" \
      org.opencontainers.image.description="Enterprise Hostel and Hotel Management System" \
      org.opencontainers.image.vendor="GrandStay Hospitality Group"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Install wget for healthchecks and tsx for execution
RUN apk add --no-cache wget

# Copy package descriptors
COPY package.json package-lock.json* ./

# Install runtime dependencies only
RUN npm ci --prefer-offline --no-audit

# Copy compiled frontend assets from builder
COPY --from=builder /app/dist ./dist

# Copy backend entrypoint and shared utilities
COPY server.ts ./
COPY tsconfig.json ./
COPY src/lib ./src/lib

# Run as non-privileged system user for container security
USER node

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["npm", "run", "start"]
