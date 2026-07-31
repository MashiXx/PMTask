# Deploying PMTask on Coolify

This repo ships a production `Dockerfile` and a `docker-compose.yml` that runs
**only the app** — it connects to your **external MySQL** database. Coolify
handles the build, reverse proxy, TLS, and auto-deploy on push, so no CI/CD
workflow is needed.

## What's included

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Node 22 image. Skips Puppeteer's Chromium download; keeps the Prisma CLI so migrations can run at boot. Runs as the non-root `node` user under `tini`. |
| `docker-entrypoint.sh` | On every start: waits for the DB, runs `prisma migrate deploy`, optionally seeds, then launches the server. |
| `docker-compose.yml` | Single `app` service with a healthcheck and a persistent `uploads` volume. |

## Coolify setup

1. **Create a resource** → *Docker Compose* → point it at this Git repository
   and branch. Coolify reads `docker-compose.yml` automatically.
2. **Set environment variables** (Configuration → Environment Variables):

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `SESSION_SECRET` | ✅ | Long random string: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
   | `DB_HOST` | ✅ | Hostname of your external MySQL server |
   | `DB_USER` | ✅ | MySQL user |
   | `DB_PASSWORD` | ✅ | MySQL password |
   | `DB_PORT` / `DB_NAME` | – | Default to `3306` / `pmtask` |
   | `DATABASE_URL` | – | Full connection string; overrides the `DB_*` components |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | – | Enable "Sign in with Google" |
   | `SEED_ON_START` | – | Set `true` for the **first** deploy to load demo data (`admin@pmtask.com` / `demo123`), then remove it |

   > The external MySQL must be reachable from the Coolify host, and the
   > database (`DB_NAME`) must already exist — the entrypoint only runs
   > migrations, it does not create the database.

3. **Domain** — Coolify uses the `SERVICE_FQDN_APP_3000` magic variable in the
   compose file to attach your domain to the app's port 3000 and provision a
   Let's Encrypt certificate.
4. **Deploy.** The entrypoint applies migrations before the server starts, and
   Coolify redeploys automatically on every push (via its GitHub integration).

## Persistence

- `pmtask-uploads` → `/app/uploads` (avatars, task attachments, documents).
  Survives redeploys; back it up before upgrades.
- Database data lives on your external MySQL — manage backups there.

## Local run

```bash
export SESSION_SECRET=dev DB_HOST=host.docker.internal DB_USER=root DB_PASSWORD=secret DB_NAME=pmtask
docker compose up --build
# → http://localhost:3000  (override the host port with APP_PORT)
```
