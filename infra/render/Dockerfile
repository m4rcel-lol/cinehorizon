# Public edge image: builds the web + admin SPAs and serves them via nginx,
# proxying /api and /media to the private api service. Build context = repo root.
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
# Same-origin in production, so the SPAs call the api at /api/v1 through nginx.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/admin ./apps/admin
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cinehorizon/web build && pnpm --filter @cinehorizon/admin build

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html/admin
COPY infra/render/nginx.conf.template /etc/nginx/nginx.conf.template
# Render injects PORT; render API host/port come from the blueprint env vars.
ENV PORT=10000 API_HOST=cinehorizon-api API_PORT=4000
CMD ["/bin/sh", "-c", "envsubst '${PORT} ${API_HOST} ${API_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
