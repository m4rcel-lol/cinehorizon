# CineHorizon

CineHorizon is a self-hostable streaming platform monorepo built from the uploaded specification: React 18 + TypeScript + Vite frontends, Node.js + Express + TypeScript API, PostgreSQL + Prisma, Redis/BullMQ, FFmpeg worker scaffolding, Docker Compose, and Nginx reverse proxy.

This repository is intentionally production-shaped: strict TypeScript, versioned `/api/v1` routes, HTTP-only refresh cookies, Prisma-only DB access, uniform API errors, server-side admin checks, HLS-first playback, and Docker deployment.

## What is implemented

- User app with Netflix-inspired browse, hero, rows, detail page, profile selection, search, and HLS player shell.
- Admin app with protected login, dashboard, content table/form, users table, and upload queue page.
- API routes for auth, refresh-token sessions, profiles, content, watchlist, history, search, admin stats/users/content/uploads, health checks, and playback URL lookup.
- Prisma schema, migrations-ready layout, indexes, seed data with demo content and Mux public HLS samples.
- Upload/transcode queue scaffold using Busboy + BullMQ + Redis + FFmpeg command builder.
- Docker Compose stack: PostgreSQL, Redis, API, worker, web, admin, Nginx.
- Shared packages for DB, types, and UI primitives.

## Important notes

The project is a complete runnable base. Uploaded videos are stored on the local filesystem only: the API streams uploads to a temporary file, the worker compresses them into HLS renditions with FFmpeg, and the original upload is deleted after processing so the media volume keeps only compressed playback assets.

## Requirements

- Docker + Docker Compose
- Node.js 20+
- pnpm 9+
- OpenSSL for local JWT key generation

## Quick start with Docker

```bash
cp .env.example .env
mkdir -p keys
openssl genrsa -out keys/private.pem 4096
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

docker compose up --build
```

Then open:

- User app: http://localhost
- Admin panel: http://localhost/admin
- API health: http://localhost/api/v1/health

Seeded admin credentials come from `.env`:

```env
ADMIN_SEED_EMAIL=admin@cinehorizon.local
ADMIN_SEED_PASSWORD=ChangeMe123!
```

## Local development without Docker

```bash
pnpm install
cp .env.example .env
mkdir -p keys
openssl genrsa -out keys/private.pem 4096
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

docker compose up -d db redis
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

## Scripts

```bash
pnpm dev          # API, worker, web, admin concurrently
pnpm build        # build all apps/packages
pnpm lint         # type-aware lint entry point
pnpm test         # Vitest unit/integration tests
pnpm test:e2e     # Playwright smoke test for browse -> detail -> player
pnpm db:generate  # Prisma generate
pnpm db:push      # Push schema to DB for development
pnpm db:seed      # Seed demo data
```

## Environment

See `.env.example` for all variables. No secrets should be committed. `.env`, keys, local media, and generated files are ignored by `.gitignore`.

## Verification

```bash
pnpm db:generate
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The API tests use Supertest against the real Express app with Prisma, Redis, storage, and queue boundaries mocked. The web tests use React Testing Library. The Playwright smoke test intercepts `/api/v1` responses so it can verify the core browse-to-player flow without requiring a live database.

## Routes

### Web

- `/` and `/browse`
- `/login`
- `/register`
- `/profiles`
- `/title/:slug`
- `/watch/:contentId`
- `/watch/:contentId/episode/:episodeId`
- `/search`
- `/account`

### Admin

- `/admin/login`
- `/admin`
- `/admin/content`
- `/admin/users`
- `/admin/uploads`
- `/admin/settings`

## Security checklist covered by the base

- HTTP-only refresh token cookie.
- Short-lived access JWTs.
- Refresh token rotation and DB session invalidation.
- Password hashing with bcryptjs cost 12.
- Helmet security headers.
- Rate limiting.
- Origin verification middleware for mutating requests.
- Zod validation for request bodies/query parameters.
- Server-side admin role enforcement.
- Upload MIME and magic-byte validation.
- Uniform error responses.

## Next steps for real production use

1. Size and back up the local media volume configured by `LOCAL_MEDIA_DIR`.
2. Add your SMTP settings and plug `sendVerificationEmail` into the auth route.
3. Run Prisma migrations instead of `db push`.
4. Configure TLS in Nginx or put the stack behind Caddy/Cloudflare.
5. Replace demo content and add your first real uploaded HLS videos.
