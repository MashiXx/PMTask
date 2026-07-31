#!/bin/sh
# ===========================================================================
# PMTask — container entrypoint
# ---------------------------------------------------------------------------
# Runs on every container start (Coolify redeploys included):
#   1. Wait for the database to accept connections.
#   2. Apply pending Prisma migrations (`migrate deploy` — safe & idempotent).
#   3. Optionally seed the database when SEED_ON_START=true.
#   4. Exec the CMD (the app server).
# ===========================================================================
set -e

# prisma-cli.js assembles DATABASE_URL from DB_* (or honours an explicit
# DATABASE_URL). Compute it once here so the wait-loop can use it too.
DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"

echo "[entrypoint] Waiting for database at ${DB_HOST}:${DB_PORT} ..."
tries=0
until node -e "require('net').connect({host:process.env.DB_HOST||'mysql',port:Number(process.env.DB_PORT||3306)}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "[entrypoint] Database not reachable after 60 attempts — giving up." >&2
    exit 1
  fi
  echo "[entrypoint] ...still waiting (${tries}/60)"
  sleep 2
done
echo "[entrypoint] Database is reachable."

echo "[entrypoint] Applying Prisma migrations (migrate deploy) ..."
node prisma/prisma-cli.js migrate deploy

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true — seeding database ..."
  node prisma/seed.js || echo "[entrypoint] Seed step failed (non-fatal), continuing."
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
