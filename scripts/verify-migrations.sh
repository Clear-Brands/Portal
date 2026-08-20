#!/usr/bin/env bash
#
# verify-migrations.sh — apply every migration to a genuinely empty database.
#
# This is the check the original schema.sql could not pass: it added columns to
# tables forty lines before creating them, so it only ever ran against a database
# that had already been through earlier versions. Running this in CI on every
# change means a fresh install can never silently break again.
#
# Usage:  ./scripts/verify-migrations.sh [dbname]

set -euo pipefail

DB="${1:-cb_verify}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL="psql -v ON_ERROR_STOP=1 -q"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Dropping and recreating $DB"
dropdb --if-exists "$DB"
createdb "$DB"

say "Installing the local auth shim (Supabase provides this for real)"
$PSQL -d "$DB" -f "$ROOT/supabase/tests/00_local_shim.sql"

say "Applying migrations in order"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %s\n' "$(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done

say "Loading seed data"
$PSQL -d "$DB" -f "$ROOT/supabase/seed.sql"

say "Sanity checks"
$PSQL -d "$DB" -f "$ROOT/supabase/tests/10_sanity.sql"

say "Row-level security assertions"
$PSQL -d "$DB" -f "$ROOT/supabase/tests/20_rls.sql"

say "Capability model"
$PSQL -d "$DB" -f "$ROOT/supabase/tests/30_capabilities.sql"
node "$ROOT/scripts/check-capability-parity.mjs"

say "All green — migrations install clean on an empty database."
