# ── Mahyar Gap production image (Railway) ─────────────────────
# Uses a Dockerfile so we control the system packages: the shared
# radio publisher needs FFmpeg to decode the external MP3 streams.

FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# FFmpeg is required by the server-side radio publisher.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install all dependencies (dev deps are needed to build)
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────
FROM base AS runtime
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

EXPOSE 3000
ENV PORT=3000
CMD ["node", "dist/server/index.js"]
