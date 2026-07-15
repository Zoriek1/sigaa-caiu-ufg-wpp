#!/bin/sh
set -eu

base_url="${1:-${EVOLUTION_PUBLIC_URL:-}}"
api_key="${AUTHENTICATION_API_KEY:-}"

if [ -z "$base_url" ] || [ -z "$api_key" ]; then
  echo "EVOLUTION_PUBLIC_URL and AUTHENTICATION_API_KEY are required" >&2
  exit 1
fi

base_url="${base_url%/}"
attempt=1
max_attempts="${HEALTHCHECK_MAX_ATTEMPTS:-30}"

while [ "$attempt" -le "$max_attempts" ]; do
  if curl --fail --silent --show-error --max-time 10 "$base_url/server/ok" >/dev/null &&
    curl --fail --silent --show-error --max-time 10 \
      --request POST \
      --header "apikey: $api_key" \
      "$base_url/verify-creds" >/dev/null; then
    echo "Evolution API is healthy"
    exit 0
  fi

  attempt=$((attempt + 1))
  sleep 5
done

echo "Evolution API did not become healthy after $max_attempts attempts" >&2
exit 1
