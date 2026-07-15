#!/bin/sh
set -eu

infra_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
env_file="${EVOLUTION_ENV_FILE:-$infra_dir/.env}"
backup_dir="${EVOLUTION_BACKUP_DIR:-$infra_dir/backups}"
retention_days="${EVOLUTION_BACKUP_RETENTION_DAYS:-7}"

if [ ! -f "$env_file" ]; then
  echo "Environment file not found: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090 -- the production env file is selected at runtime.
. "$env_file"
set +a

umask 077
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_dir/evolution-$timestamp.dump"

docker compose \
  --env-file "$env_file" \
  --file "$infra_dir/compose.yaml" \
  exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl \
    --username "$POSTGRES_USERNAME" \
    --dbname "$POSTGRES_DATABASE" >"$target"

find "$backup_dir" -type f -name 'evolution-*.dump' -mtime "+$retention_days" -delete
echo "$target"
