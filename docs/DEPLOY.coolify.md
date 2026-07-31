# Deploying PMTask on Coolify

This repo ships a production `Dockerfile`, a `docker-compose.yml` tailored for
[Coolify](https://coolify.io), and a GitHub Actions CI/CD pipeline.

## What's included

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Node 22 image. Skips Puppeteer's Chromium download; keeps the Prisma CLI so migrations can run at boot. Runs as the non-root `node` user under `tini`. |
| `docker-entrypoint.sh` | On every start: waits for MySQL, runs `prisma migrate deploy`, optionally seeds, then launches the server. |
| `docker-compose.yml` | Two services — `app` + `mysql` — with healthchecks and named volumes for uploads and DB data. |
| `.github/workflows/ci-cd.yml` | CI (test + Prisma validate + image build) on every push/PR; CD (Coolify webhook) on pushes to the deploy branch. |

## One-time Coolify setup

1. **Create a resource** → *Docker Compose* → point it at this Git repository
   and branch. Coolify reads `docker-compose.yml` automatically.
2. **Set environment variables** (Configuration → Environment Variables):

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `SESSION_SECRET` | ✅ | Long random string: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
   | `DB_PASSWORD` | ✅ | Password for the app's MySQL user |
   | `DB_ROOT_PASSWORD` | ✅ | MySQL root password |
   | `DB_USER` / `DB_NAME` | – | Default to `pmtask` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | – | Enable "Sign in with Google" |
   | `SEED_ON_START` | – | Set `true` for the **first** deploy to load demo data (`admin@pmtask.com` / `demo123`), then remove it |

3. **Domain** — Coolify uses the `SERVICE_FQDN_APP_3000` magic variable in the
   compose file to attach your domain to the app's port 3000 and provision a
   Let's Encrypt certificate. Assign the domain in the Coolify UI.
4. **Deploy.** The entrypoint applies migrations before the server starts, so a
   fresh database is schema-ready on first boot.

## Continuous deployment

Pushes to the deploy branch trigger a Coolify redeploy from GitHub Actions.
Add two repository secrets (Settings → Secrets and variables → Actions):

- `COOLIFY_WEBHOOK` — the resource's **Deploy Webhook** URL
  (Coolify → your resource → Webhooks).
- `COOLIFY_TOKEN` — a Coolify **API token** (Keys & Tokens → API tokens).

Without these secrets CI still runs; only the deploy step is skipped. You can
alternatively let Coolify's own GitHub App auto-deploy on push and delete the
`deploy` job.

## Persistence & backups

- `pmtask-uploads` → `/app/uploads` (avatars, task attachments, documents).
- `pmtask-db` → `/var/lib/mysql`.

Both survive redeploys. Back up the `pmtask-db` volume (or use a managed
MySQL and point `DB_HOST`/`DATABASE_URL` at it) before upgrades.

## Local smoke test

```bash
export SESSION_SECRET=dev DB_PASSWORD=pmtask DB_ROOT_PASSWORD=root
docker compose up --build
# → http://localhost:3000
```
