# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-alpine AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV ORDER_DB_PATH=/data/orders.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY package.json ./package.json
COPY server ./server
COPY src/lib/menu-catalog.ts src/lib/restaurant.ts ./src/lib/
EXPOSE 3000
CMD ["node", "server/production.mjs"]
