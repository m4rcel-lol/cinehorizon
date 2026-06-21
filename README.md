# CineHorizon

CineHorizon is a self-hostable, Netflix-style catalog monorepo: React 18 + TypeScript + Vite frontends, Node.js + Express + TypeScript API, PostgreSQL + Prisma, Redis/BullMQ, an FFmpeg worker, Docker Compose, and an Nginx reverse proxy.

It hosts two catalogs behind one Netflix-inspired UI:

- **Software & Games** — the primary, actively-developed domain: a curated "Netflix for software" storefront with featured heroes, Trending/Top rails, detail pages, and direct downloads.
- **Streaming (movies & series)** — the original video domain with HLS playback, profiles, watchlist, and continue-watching. It is kept runnable but is now secondary; see `TODO.md` for the direction.

This repository is intentionally production-shaped: strict TypeScript, versioned `/api/v1` routes, HTTP-only refresh cookies, Prisma-only DB access, uniform API errors, server-side admin checks, HLS-first playback, and Docker deployment.

## What is implemented

- User app with Netflix-inspired browse, hero, rows, detail page, profile selection, search, and HLS player shell.
- Admin app with protected login, dashboard, content table/form, users table, and upload queue page.
- API routes for auth, refresh-token sessions, profiles, content, watchlist, history, search, admin stats/users/content/uploads, health checks, and playback URL lookup.
- Prisma schema, migrations-ready layout, indexes, and seed setup for the admin account plus base genres.
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

For local Docker development, missing JWT keys are generated automatically into the ignored `./keys` directory during API startup. Production deployments should mount pre-generated keys instead.

Then open:

- User app: http://localhost:47304
- Admin panel: http://localhost:47304/admin
- API health: http://localhost:47304/api/v1/health

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
pnpm db:seed      # Seed the admin account and base genres
```

## Environment

See `.env.example` for all variables. No secrets should be committed. `.env`, keys, local media, and generated files are ignored by `.gitignore`.

If you open the Docker site through a hostname other than `localhost` or `127.0.0.1`, set `CORS_ORIGINS` in `.env` to the exact browser origin, for example `CORS_ORIGINS=http://192.168.1.20:47304`.

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
- `/games` and `/games/:slug` (software/game storefront + detail)
- `/software` and `/software/:slug`
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
- Email verification + password reset over a pluggable email service (SMTP/SES-compatible; console transport in dev).
- Self-service device/session management (list + revoke) and password change that re-secures other devices.
- Account-enumeration-safe forgot-password responses.
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
2. Set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` (e.g. Amazon SES SMTP) so verification and password-reset emails actually send — without them the API logs emails to the console. Status is visible in **Admin → Settings**.
3. Run Prisma migrations instead of `db push` (new models added: `PasswordResetToken`, `SavedDownload`).
4. Configure TLS in Nginx or put the stack behind Caddy/Cloudflare.
5. Upload and publish your first titles from the admin panel.
