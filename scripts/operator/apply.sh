#!/usr/bin/env bash
# Operator-only apply: rebuild/recreate stack via docker compose.
# Mutates containers/images — requires explicit --yes or --i-understand.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

usage() {
  cat <<'EOF'
Usage: apply.sh --yes|--i-understand [extra docker compose args...]

  Runs from repo root context:
    docker compose -f <compose> --env-file <env> up -d --build

  You must pass exactly one of:
    --yes            Confirm apply (destructive to running containers as per compose)
    --i-understand   Same as --yes (explicit operator acknowledgement)

  Any additional arguments are passed through to `docker compose ... up`.

  Environment (optional):
    COMPOSE_FILE   (default: <repo>/docker-compose.prod.yml)
    ENV_FILE       (default: <repo>/.env)

  Does not run in background. Does not automate rollback.

Refuses to run without an explicit confirmation flag.
EOF
}

CONFIRM=0
EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --yes|--i-understand)
      CONFIRM=1
      shift
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done
EXTRA=("$@")

if [[ "$CONFIRM" -ne 1 ]]; then
  echo "Refusing to apply: pass --yes or --i-understand to confirm." >&2
  usage >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "== CRM operator apply =="
echo "repo:        $REPO_ROOT"
echo "compose:     $COMPOSE_FILE"
echo "env file:    $ENV_FILE"
echo
echo "This will run (foreground):"
echo "  docker compose -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" up -d --build ${EXTRA[*]:+${EXTRA[*]}}"
echo
echo "Ensure you have a database backup and have run scripts/operator/preflight.sh successfully."
echo

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build "${EXTRA[@]}"
