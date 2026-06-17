FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/admin ./apps/admin
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cinehorizon/admin build

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html/admin
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
