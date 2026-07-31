#!/bin/sh
# ===========================================================================
# PMTask — container entrypoint
# ---------------------------------------------------------------------------
# Runs on every container start (Coolify redeploys included):
#   1. Make sure the uploads mount is present and writable.
#   2. Wait for the database to accept connections.
#   3. Apply pending Prisma migrations (`migrate deploy` — safe & idempotent).
#   4. Optionally seed the database when SEED_ON_START=true.
#   5. Exec the CMD (the app server).
# ===========================================================================
set -e

# /app/uploads is bind-mounted from the host (see docker-compose.yml). A fresh
# host directory is created owned by root, which this non-root process cannot
# write to — fail loudly with the fix instead of 500-ing on the first upload.
UPLOAD_DIR=/app/uploads
if ! mkdir -p "${UPLOAD_DIR}/avatars" "${UPLOAD_DIR}/tasks" 2>/dev/null || [ ! -w "${UPLOAD_DIR}" ]; then
  echo "[entrypoint] ${UPLOAD_DIR} is not writable by uid $(id -u)." >&2
  echo "[entrypoint] Fix the host directory mounted there, then redeploy:" >&2
  echo "[entrypoint]   sudo chown -R 1000:1000 <host-uploads-dir>" >&2
  exit 1
fi
echo "[entrypoint] Uploads directory ready at ${UPLOAD_DIR}."

# Wait for the external database to accept TCP connections. When only a full
# DATABASE_URL is provided (no DB_HOST), skip the wait — Prisma resolves the
# host itself and migrations will retry.
if [ -n "${DB_HOST}" ]; then
  DB_PORT="${DB_PORT:-3306}"
  echo "[entrypoint] Waiting for database at ${DB_HOST}:${DB_PORT} ..."
  tries=0
  until node -e "require('net').connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306)}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
      echo "[entrypoint] Database not reachable after 60 attempts — giving up." >&2
      exit 1
    fi
    echo "[entrypoint] ...still waiting (${tries}/60)"
    sleep 2
  done
  echo "[entrypoint] Database is reachable."
else
  echo "[entrypoint] DB_HOST not set — using DATABASE_URL directly, skipping TCP wait."
fi

echo "[entrypoint] Applying Prisma migrations (migrate deploy) ..."
node prisma/prisma-cli.js migrate deploy

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true — seeding database ..."
  node prisma/seed.js || echo "[entrypoint] Seed step failed (non-fatal), continuing."
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
