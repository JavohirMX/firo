# Multi-stage Dockerfile for Firo: single-container hosting web assets + sync server
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy repo files according to .dockerignore
COPY . .

# Install dependencies (frozen lockfile)
RUN yarn --frozen-lockfile --network-timeout 600000

# Build monorepo packages
RUN yarn build:packages

# Build web frontend and place in apps/web/dist
RUN yarn --cwd apps/web build:app:docker && \
    mkdir -p apps/web/dist && \
    cp -r apps/web/build/* apps/web/dist/

# Build sync server
RUN yarn --cwd apps/server build

# Production runner stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    FIRO_PORT=8080 \
    FIRO_DATA_DIR=/data \
    FIRO_DB_PATH=/data/firo.sqlite \
    FIRO_WEB_DIR=/app/apps/web/dist

# Copy package manifests and runtime dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/dist ./public

# Persist SQLite database and file uploads
VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/healthz', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["node", "apps/server/dist/index.js"]
