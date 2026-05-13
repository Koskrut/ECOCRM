#!/usr/bin/env bash
# Sync compose YAML from deployment manifest (composeFileUrls), then docker compose pull.
# Run from bundle root, e.g.:
#   cd /opt/crm && ENV_FILE=suprex/.env MANIFEST_URL='https://cp.example/api/...' ./suprex/client-pull-agent.sh
#
# One of: MANIFEST_URL, DEPLOYMENT_MANIFEST_PATH, or ./deployment-manifest.json in bundle root.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BUNDLE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$BUNDLE_ROOT"

if [[ -z "${ENV_FILE:-}" ]]; then
  echo "ENV_FILE is required (e.g. ENV_FILE=suprex/.env)" >&2
  exit 1
fi

if [[ "$ENV_FILE" == /* ]]; then
  ENV_ABS="$ENV_FILE"
else
  ENV_ABS="$BUNDLE_ROOT/$ENV_FILE"
fi

if [[ ! -f "$ENV_ABS" ]]; then
  echo "Env file not found: $ENV_ABS" >&2
  exit 1
fi

TMP=$(mktemp)
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

if [[ -n "${DEPLOYMENT_MANIFEST_PATH:-}" ]]; then
  if [[ "$DEPLOYMENT_MANIFEST_PATH" == /* ]]; then
    MP="$DEPLOYMENT_MANIFEST_PATH"
  else
    MP="$BUNDLE_ROOT/$DEPLOYMENT_MANIFEST_PATH"
  fi
  cp "$MP" "$TMP"
elif [[ -n "${MANIFEST_URL:-}" ]]; then
  curl -fsSL "$MANIFEST_URL" -o "$TMP"
elif [[ -f "$BUNDLE_ROOT/deployment-manifest.json" ]]; then
  cp "$BUNDLE_ROOT/deployment-manifest.json" "$TMP"
else
  echo "Provide MANIFEST_URL, DEPLOYMENT_MANIFEST_PATH, or place deployment-manifest.json in $BUNDLE_ROOT" >&2
  exit 1
fi

node "$BUNDLE_ROOT/scripts/sync-compose-from-manifest.mjs" --manifest "$TMP" --root "$BUNDLE_ROOT"

mapfile -t COMPOSE_PATHS < <(node -e "
const fs = require('node:fs');
const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const r = process.argv[2];
for (const cf of j.composeFiles || []) {
  console.log(require('node:path').join(r, cf));
}
" "$TMP" "$BUNDLE_ROOT")

if [[ ${#COMPOSE_PATHS[@]} -eq 0 ]]; then
  echo "Manifest has no composeFiles" >&2
  exit 1
fi

ARGS=()
for fp in "${COMPOSE_PATHS[@]}"; do
  ARGS+=(-f "$fp")
done

if [[ "${SKIP_DOCKER_PULL:-}" == "1" ]]; then
  echo "SKIP_DOCKER_PULL=1 set; compose files are ready under $BUNDLE_ROOT"
  exit 0
fi

docker compose "${ARGS[@]}" --env-file "$ENV_ABS" pull
