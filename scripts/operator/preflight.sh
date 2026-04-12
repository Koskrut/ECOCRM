#!/usr/bin/env bash
# Read-only preflight checks for on-prem Docker Compose deploys.
# No writes, no pulls, no compose up — safe to run anytime.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
MIN_FREE_KB="${MIN_FREE_KB:-1048576}"

usage() {
  sed -n '1,80p' <<'EOF'
Usage: preflight.sh [--repo-root DIR]

Environment (optional):
  COMPOSE_FILE   Path to docker-compose.prod.yml (default: <repo>/docker-compose.prod.yml)
  ENV_FILE       Path to .env for compose (default: <repo>/.env)
  MIN_FREE_KB    Minimum free disk space on repo filesystem in KiB (default: 1048576 ~= 1 GiB)

Exits 0 if all checks pass, non-zero otherwise.
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--repo-root" ]] && [[ -n "${2:-}" ]]; then
  REPO_ROOT="$(cd "$2" && pwd)"
  COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
  ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
  shift 2
fi

failures=0
fail() {
  echo "[fail] $*" >&2
  failures=$((failures + 1))
}
pass() {
  echo "[ok]   $*"
}

echo "== CRM operator preflight (read-only) =="
echo "repo:       $REPO_ROOT"
echo "compose:    $COMPOSE_FILE"
echo "env file:   $ENV_FILE"
echo

if command -v docker >/dev/null 2>&1; then
  pass "docker CLI present ($(command -v docker))"
else
  fail "docker CLI not found in PATH"
fi

if docker info >/dev/null 2>&1; then
  pass "docker daemon reachable"
else
  fail "docker daemon not reachable (try: docker info)"
fi

if docker compose version >/dev/null 2>&1; then
  pass "docker compose available ($(docker compose version --short 2>/dev/null || echo ok))"
else
  fail "docker compose not available"
fi

if [[ -f "$COMPOSE_FILE" ]]; then
  pass "compose file exists"
else
  fail "compose file missing: $COMPOSE_FILE"
fi

if [[ -f "$ENV_FILE" ]]; then
  pass "env file exists"
  if grep -E -q '^[[:space:]]*POSTGRES_PASSWORD=' "$ENV_FILE" 2>/dev/null; then
    pass "POSTGRES_PASSWORD is set in env file (key present)"
  else
    fail "POSTGRES_PASSWORD not found in $ENV_FILE (required by docker-compose.prod.yml)"
  fi
else
  fail "env file missing: $ENV_FILE (copy from apps/backend/.env.example and configure)"
fi

# Free space on filesystem holding the repo (KiB)
free_kb="$(df -Pk "$REPO_ROOT" 2>/dev/null | awk 'NR==2 {print $4}')"
if [[ -n "$free_kb" ]] && [[ "$free_kb" =~ ^[0-9]+$ ]]; then
  if (( free_kb >= MIN_FREE_KB )); then
    pass "disk free on repo fs: ${free_kb} KiB (min ${MIN_FREE_KB} KiB)"
  else
    fail "disk free on repo fs: ${free_kb} KiB (need at least ${MIN_FREE_KB} KiB — set MIN_FREE_KB to override)"
  fi
else
  fail "could not read free disk space (df)"
fi

# Optional: show release-related keys from .env if readable (no secrets printed)
if [[ -f "$ENV_FILE" ]] && [[ -r "$ENV_FILE" ]]; then
  grep -E '^(CRM_RELEASE_VERSION|GIT_SHA|BUILD_TIME|IMAGE_TAG)=' "$ENV_FILE" 2>/dev/null | while IFS= read -r line; do
    pass "env hint: ${line%%=*}=<set>"
  done
fi

echo
if (( failures == 0 )); then
  echo "RESULT: ok (all checks passed)"
  echo "PREFLIGHT_OK=1"
  exit 0
else
  echo "RESULT: failed ($failures check(s))"
  echo "PREFLIGHT_OK=0"
  exit 1
fi
