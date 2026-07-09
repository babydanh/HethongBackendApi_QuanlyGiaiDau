# Base image
FROM node:20-alpine AS base
RUN npm install -g pnpm

# Install dependencies
FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build
# Prune dev dependencies
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Production image
FROM node:20-alpine AS deploy
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrate.ts ./migrate.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/database/migrations ./src/database/migrations

EXPOSE 3000
CMD ["node", "dist/main"]
