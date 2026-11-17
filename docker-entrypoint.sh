#!/bin/sh
# DemoHub — Docker entrypoint
# Runs Prisma migrations (if DATABASE_URL points to a DB we can migrate),
# generates the Prisma client, then starts Next.js.

set -e

echo "▶ DemoHub starting..."

# Generate Prisma client (idempotent; ensures client matches schema)
echo "▶ Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

# Run migrations if DATABASE_URL is set and points to a real DB
if [ -n "$DATABASE_URL" ]; then
  echo "▶ Running Prisma migrations..."
  # --accept-data-loss is safe for SQLite dev; for Postgres prod, remove it
  npx prisma migrate deploy --schema=./prisma/schema.prisma || {
    echo "⚠ Migration failed (may already be applied). Continuing..."
  }
fi

echo "▶ Starting Next.js..."
exec "$@"
