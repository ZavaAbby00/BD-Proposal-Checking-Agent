#!/bin/sh
# Container entrypoint: apply pending DB migrations, then start the server.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] Starting Next.js on port ${PORT:-8080}..."
exec npm run start -- --port "${PORT:-8080}"
