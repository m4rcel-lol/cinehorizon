# CineHorizon — Roadmap

CineHorizon began as a Netflix-style video-streaming clone and is pivoting toward
**"Netflix for software"** — a curated storefront where people browse and download
games and software with the same hero + rails + detail experience Netflix uses for film.

This file tracks the product direction and the prioritized backlog from the codebase review.

## Product direction

- **Downloads (games + software) is the primary domain.** Invest feature work here.
- **Streaming (movies/series) stays but is secondary.** Keep it compiling and runnable;
  do not delete it yet (existing data/migrations), but stop building new features on it.
- **Share the plumbing, not the tables**: auth/sessions, the upload + storage service,
  BigInt file-size handling, slug helpers, and the merchandising-row *pattern* are shared;
  the catalog entities stay distinct (movies have episodes/transcode/profiles; software has
  versions/changelog/system-requirements/per-OS builds).

## Done (this pass)

- [x] Fixed admin panel access (white screen).
- [x] Stopped tracking built `dist/` artifacts in git (they were committed despite `.gitignore`).
- [x] `Download` is now first-class: `isFeatured` / `isTrending` / `isTopRanked` / `rank`
      merchandising flags + supporting indexes.
- [x] Netflix-style download API: `/downloads/featured`, `/trending`, `/top` shelves + list pagination.
- [x] Web storefront rebuilt: hero + horizontal rails + a real download **detail page** (`/games/:slug`, `/software/:slug`).
- [x] Admin: quick merchandising toggles (Featured / Trending / Top) on the downloads table.
- [x] Seed now publishes a sample games + software catalog so the storefront renders out of the box.
- [x] Refactors: shared `pickDefined()` + memoized ffmpeg resolver, completed-items filtered out of
      Continue Watching, real progress-bar math, typed auth payloads (removed `any`), shared `<Footer>`.
- [x] Tests: added integration coverage for the downloads list / featured / detail routes.

### Account, email & admin pass

- [x] **Transactional email** via a pluggable service (`services/email.ts`): SMTP that's SES/Postmark/Mailgun/Gmail
      compatible, console transport in dev. Branded verification + password-reset templates.
- [x] **Auth lifecycle**: verification email on register + resend, forgot/reset password (enumeration-safe,
      revokes sessions on reset), change-password (keeps current device, drops the rest).
- [x] **Account experience, DB-backed**: rebuilt Account page — verification status + resend, change password,
      device/session list with revoke, "My List" (watchlist) + "My Library" (saved downloads) tabs.
      New `SavedDownload` model + `/library` API + Save buttons on download detail.
- [x] **Production admin**: rewrote the placeholder Users/Uploads/Settings pages (typed, with loading/empty
      states, search, pagination, confirmations); live system status via `/admin/system`; toast notifications.
- [x] **UI/UX + motion**: toasts, reveal/entrance animations, skeletons, hover micro-interactions, branded
      route loader, reduced-motion respected — across web + admin.
- [x] Tests: added coverage for password reset, change-password, and session listing. Rate limiter skips in test env.

## Next — high value (do first)

- [ ] **Gate media + download access.** `/media` static files and the `/download` route are public
      and guessable. Add short-lived signed URLs or an auth-checked media proxy. (security, L)
- [ ] **Profile PINs + kids-mode enforcement** to round out the multi-profile account experience. (M)
- [ ] **Full edit drawers** for content + downloads in admin (API PATCH already exists; wire the UI). (M)
- [ ] **Download versioning.** Add a `DownloadVersion` model (version, changelog, per-platform build,
      file, checksum, `isLatest`) and migrate the inlined file fields into it. This is the defining
      software-vs-movie difference. (data model, L)
- [ ] **Relational taxonomy.** Replace free-text `Download.genre` with a `Tag`/`SoftwareGenre` M:N and
      seed real software/game categories; enables filtered browse rows. (data model, M)
- [ ] **Edit existing catalog entries** in admin (content + downloads). Today it is add + delete only. (admin, L)
- [ ] **Wrap multi-step writes in `prisma.$transaction`** (content+cast PATCH/DELETE, video+job create). (api, S–M)

## Next — store-quality polish

- [ ] `DownloadMedia` screenshots gallery + show it on the detail page. (S)
- [ ] `Review` model + denormalized `ratingAvg` / `ratingCount`, with star ratings on cards/detail. (M)
- [ ] `Collection` curated lists ("Best free design tools", "Indie spotlight") as editorial rows. (M)
- [ ] `SystemRequirement` model (min/recommended per platform) on the detail page. (M)
- [ ] Replace `Download.isPublished` boolean with a `DownloadStatus` enum (DRAFT/PUBLISHED/ARCHIVED). (S)
- [ ] `createdById` audit relation + physical-file GC on delete (no orphaned blobs). (S)
- [ ] "My Library" / wishlist for owned or saved downloads (decide profile-vs-user). (M)

## Engineering hardening

- [ ] Extract a shared `@cinehorizon/client` package (api-client + auth store + design tokens) used by web & admin. (M)
- [ ] Shared loading skeletons + error/retry states across all rails and pages. (M)
- [ ] Structured logging + request IDs; worker graceful shutdown (SIGTERM drain); keep failed-job history. (M)
- [ ] Real email (verification + password reset) + session listing/revocation. (M–L)
- [ ] Split the 600-line `apps/api/src/routes/admin.ts` into per-domain sub-routers; extract the shared Busboy upload helper. (M)
- [ ] Consolidate the two Discord bots and wire the chosen one into `render.yaml` (or delete `infra/bot`). (M)
- [ ] Pin `cloudflared` in `preview.yml`; replace inline `python3` JSON parsing with `jq` in `deploy.yml`. (S)
- [ ] Mobile nav menu + make card metadata reachable on touch (hover preview is invisible on mobile). (M)
