FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg openssl libc6-compat
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cinehorizon/db db:generate
RUN pnpm --filter @cinehorizon/api build
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
