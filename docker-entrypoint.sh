#!/bin/sh
# DemoHub — Docker entrypoint
# Generates the Prisma client (idempotent), runs migrations if a DB URL is set,
# then starts Next.js. Safe to run on every container start.

set -e

echo "▶ DemoHub starting..."

# Ensure Prisma client is generated (matches the schema shipped in the image)
echo "▶ Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma || {
  echo "⚠ Prisma generate failed. Continuing..."
}

# Run migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "▶ Running Prisma migrations..."
  # migrate deploy is idempotent — safe to run on every start.
  # For SQLite dev it works directly; for Postgres prod it applies pending migrations.
  npx prisma migrate deploy --schema=./prisma/schema.prisma || {
    echo "⚠ Migration failed (may already be applied or DB not ready). Continuing..."
  }
else
  echo "▶ No DATABASE_URL set — skipping migrations."
fi

echo "▶ Starting Next.js..."
exec "$@"
