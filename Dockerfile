# Base image
FROM node:22-slim AS base
RUN npm install -g pnpm@9.15.4

# Install dependencies
FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm install -g @nestjs/cli
RUN pnpm build
# Prune dev dependencies
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Production image
FROM node:22-slim AS deploy
WORKDIR /app
# seed-ward-boundaries.js tự tải cây GeoJSON (~630 MB) bằng git sparse-checkout
# khi máy chưa có cache; node:22-slim không có sẵn git. ca-certificates để
# clone qua https.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrate.ts ./migrate.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/database/migrations ./src/database/migrations
COPY --from=build /app/run-prod-migration.js ./run-prod-migration.js
COPY --from=build /app/seed-regions-v2.js ./seed-regions-v2.js
COPY --from=build /app/seed-ward-boundaries.js ./seed-ward-boundaries.js
# Ánh xạ tay tên phường -> mã: thiếu file này thì script chạy nhưng bỏ qua
# mọi override, nên độ phủ tụt mà không ai biết.
COPY --from=build /app/seed ./seed

EXPOSE 3000
CMD ["node", "dist/main"]
