#!/bin/sh
set -eu

deploy_root="${1:?deploy root is required}"
release_sha="${2:?release SHA is required}"
release_dir="$deploy_root/releases/$release_sha"
shared_env="$deploy_root/shared/.env"
current_link="$deploy_root/current"

if [ ! -d "$release_dir" ]; then
  echo "Release directory not found: $release_dir" >&2
  exit 1
fi

if [ ! -f "$shared_env" ]; then
  echo "Production environment file not found: $shared_env" >&2
  exit 1
fi

chmod 600 "$shared_env"
ln -sfn "$shared_env" "$release_dir/.env"

previous_release=""
if [ -L "$current_link" ]; then
  previous_release="$(readlink -f "$current_link")"
fi

if [ -n "$previous_release" ] && [ -f "$previous_release/compose.yaml" ]; then
  running_postgres="$(docker compose --env-file "$shared_env" --file "$previous_release/compose.yaml" ps --status running --quiet postgres)"
  if [ -n "$running_postgres" ]; then
    EVOLUTION_ENV_FILE="$shared_env" \
      EVOLUTION_BACKUP_DIR="$deploy_root/shared/backups" \
      sh "$previous_release/scripts/backup-postgres.sh"
  fi
fi

deploy_status=0
docker compose --env-file "$shared_env" --file "$release_dir/compose.yaml" config --quiet || deploy_status=$?
if [ "$deploy_status" -eq 0 ]; then
  docker compose --env-file "$shared_env" --file "$release_dir/compose.yaml" pull || deploy_status=$?
fi
if [ "$deploy_status" -eq 0 ]; then
  docker compose --env-file "$shared_env" --file "$release_dir/compose.yaml" up --detach --wait --wait-timeout 300 || deploy_status=$?
fi
if [ "$deploy_status" -eq 0 ]; then
  set -a
# shellcheck disable=SC1090 -- the shared production env file is selected at runtime.
  . "$shared_env"
  set +a
  sh "$release_dir/scripts/healthcheck.sh" || deploy_status=$?
fi

if [ "$deploy_status" -eq 0 ]; then
  ln -sfn "$release_dir" "$current_link"
  echo "Evolution release $release_sha deployed successfully"
  exit 0
fi

echo "Evolution deploy failed; starting rollback" >&2
if [ -n "$previous_release" ] && [ -f "$previous_release/compose.yaml" ]; then
  docker compose --env-file "$shared_env" --file "$previous_release/compose.yaml" up --detach --wait --wait-timeout 300
  set -a
# shellcheck disable=SC1090 -- the shared production env file is selected at runtime.
  . "$shared_env"
  set +a
  sh "$previous_release/scripts/healthcheck.sh"
  echo "Rollback completed" >&2
else
  echo "No previous release is available for rollback" >&2
fi

exit "$deploy_status"
