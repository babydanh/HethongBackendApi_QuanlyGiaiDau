# Base image
FROM node:22-alpine AS base
RUN npm install -g pnpm

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
FROM node:22-alpine AS deploy
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrate.ts ./migrate.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/database/migrations ./src/database/migrations
COPY --from=build /app/run-prod-migration.js ./run-prod-migration.js

EXPOSE 3000
CMD ["node", "dist/main"]
