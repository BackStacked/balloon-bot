# syntax=docker/dockerfile:1
# Production image for this TypeScript bot. The .env is mounted read-only at runtime.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=1000:1000 /app ./
USER 1000:1000
CMD ["node", "dist/index.js"]
