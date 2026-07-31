# syntax=docker/dockerfile:1

# ===========================================================================
# PMTask — production image
# ---------------------------------------------------------------------------
# Multi-stage build:
#   1. deps    — install ALL dependencies (needed for `prisma generate`)
#   2. runtime — slim image with the app, generated Prisma client, and the
#                Prisma CLI kept around so migrations can run at boot.
# Puppeteer's Chromium download is skipped: it's only used for local
# screenshots/tests and must never bloat the production image.
# ===========================================================================

# --- Stage 1: dependencies + Prisma client -------------------------------
FROM node:22-alpine AS deps

# Prisma needs OpenSSL present to detect the correct query-engine binary.
RUN apk add --no-cache openssl

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    npm_config_puppeteer_skip_download=true

WORKDIR /app

# Install dependencies against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client (reads prisma/schema.prisma).
COPY prisma ./prisma
RUN npx prisma generate


# --- Stage 2: runtime ----------------------------------------------------
FROM node:22-alpine AS runtime

# su-exec lets the entrypoint drop from root to `node` after fixing the
# ownership of the bind-mounted uploads directory.
RUN apk add --no-cache openssl tini su-exec

ENV NODE_ENV=production \
    PORT=3000 \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# node_modules (incl. generated Prisma client + Prisma CLI for migrations).
COPY --from=deps /app/node_modules ./node_modules

# Application source.
COPY . .

# Uploads are written at runtime; make sure the dir exists, the entrypoint is
# executable, and everything is owned by the non-root `node` user that ships
# with the base image.
RUN mkdir -p uploads \
    && chmod +x docker-entrypoint.sh \
    && chown -R node:node /app

# NOTE: no `USER node` here on purpose. The entrypoint starts as root only to
# chown the bind-mounted uploads volume, then re-execs itself as `node` via
# su-exec — the app process itself never runs privileged.

EXPOSE 3000

# tini reaps zombies and forwards signals so the container stops cleanly.
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
