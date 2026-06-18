# Deploy pipeline (Render + Discord)

Auto-deploys `main` to Render after CI passes, rotates the admin password each
release, and reports live status to Discord. **No secrets live in this repo** —
everything is read from GitHub Actions secrets.

## Topology

`render.yaml` provisions:

| Resource | Render type | Notes |
|----------|-------------|-------|
| `cinehorizon-web` | web (Docker) | Public edge: serves web + admin SPAs, proxies `/api` + `/media`. Single origin → `sameSite=strict` cookies keep working. |
| `cinehorizon-api` | private (Docker) | API **and** transcode worker in one container, sharing one disk (`/var/data`) for media + JWT keys. |
| `cinehorizon-db` | Postgres | Managed. |
| `cinehorizon-redis` | Key Value | BullMQ transcode queue. |

## One-time setup

1. **Create the blueprint.** Render dashboard → Blueprints → New → pick this
   repo. It reads `render.yaml`. Approve resource creation.
2. **Fill the deferred env vars** on `cinehorizon-api` (marked `sync: false`).
   After the first deploy you'll know the public URL (e.g.
   `https://cinehorizon-web.onrender.com`). Set all of these to that origin:
   - `BASE_URL`, `WEB_ORIGIN`, `ADMIN_ORIGIN` (= `…/admin`), `MEDIA_PUBLIC_URL`
     (= `…/media`), `CORS_ORIGINS` (the origin), `COOKIE_DOMAIN` (the host),
   - `ADMIN_SEED_EMAIL` (e.g. `admin@cinehorizon.app`). `ADMIN_SEED_PASSWORD`
     is overwritten by the workflow each deploy.
3. **Invite the Discord bot** to your server with Manage Channels + Send
   Messages. Replace `CLIENT_ID` with your application's client id:
   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot&permissions=2064
   ```
   (`2064` = View Channels + Send Messages + Manage Channels.) The bot creates
   the `CINEHORIZON DEPLOYS` category and `#deploy-status`, `#build-logs`,
   `#admin-access` (private) on first run.
4. **Add GitHub Actions secrets** (repo → Settings → Secrets and variables →
   Actions):

   | Secret | Value |
   |--------|-------|
   | `RENDER_API_KEY` | Render API key (**rotate the one shared in chat**) |
   | `RENDER_API_SERVICE_ID` | `srv-…` id of `cinehorizon-api` |
   | `RENDER_WEB_SERVICE_ID` | `srv-…` id of `cinehorizon-web` |
   | `RENDER_APP_URL` | public URL, e.g. `https://cinehorizon-web.onrender.com` |
   | `DISCORD_BOT_TOKEN` | bot token (**rotate the one shared in chat**) |
   | `DISCORD_GUILD_ID` | `1517241452026003706` (not sensitive) |
   | `ADMIN_SEED_EMAIL` | same email as step 2 |

## How a deploy runs

1. Push to `main` → `test` workflow runs (typecheck, unit/integration, build, e2e).
2. On success, `deploy` workflow: ensures Discord channels → posts 🟡 building →
   generates a random admin password → sets it on Render → triggers api + web
   deploys → polls until `live` → posts 🟢/🔴 → DMs credentials to `#admin-access`.

You can also trigger a deploy manually from the Actions tab (workflow_dispatch).

## Security notes

- Admin credentials land in `#admin-access` (password spoiler-tagged). Keep that
  channel restricted; messages persist in history. Prefer rotating regularly.
- The Render API key and bot token are full-control credentials. Store them only
  as GitHub secrets, and rotate immediately if they're ever exposed.
