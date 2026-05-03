#!/usr/bin/env bash
# Full core + module sidecar compose stack: validate merged config and hit /system/version
# inside each running worker (wget). Requires images/tags from .env (see README / .env.base.example).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

COMPOSE_FILES=(
  -f "$ROOT/compose.base.yml"
  -f "$ROOT/compose.client.yml"
  -f "$ROOT/compose.modules.finance-sidecar.yml"
  -f "$ROOT/compose.modules.bitrix-sidecar.yml"
  -f "$ROOT/compose.modules.google-sheet-sidecar.yml"
  -f "$ROOT/compose.modules.ringostat-sidecar.yml"
  -f "$ROOT/compose.modules.np-sidecar.yml"
  -f "$ROOT/compose.modules.planning-sidecar.yml"
  -f "$ROOT/compose.modules.outbound-sidecar.yml"
)

dc() {
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" "$@"
}

usage() {
  echo "Usage: ENV_FILE=$ROOT/.env $0 {config|smoke|up|down} [extra args for up/down...]" >&2
  echo "  smoke: optional SMOKE_PUBLIC_BACKEND=1 curl http://BACKEND_BIND:BACKEND_PORT/system/version" >&2
  exit 1
}

cmd="${1:-}"
shift || true
case "$cmd" in
config)
  dc config >/dev/null
  echo "compose config: ok"
  ;;
smoke)
  services=(
    backend
    backend-finance
    backend-bitrix
    backend-google-sheet
    backend-ringostat
    backend-np
    backend-planning
    backend-outbound
  )
  for s in "${services[@]}"; do
    out="$(dc exec -T "$s" wget -qO- http://localhost:3001/system/version)"
    echo "${s}: ${out}"
  done
  # compose.client publishes core backend on host (optional host check)
  if [[ "${SMOKE_PUBLIC_BACKEND:-}" == "1" ]]; then
    curl -sfS "http://${BACKEND_BIND_ADDRESS:-127.0.0.1}:${BACKEND_PORT:-3001}/system/version" >/dev/null
    echo "curl host ${BACKEND_BIND_ADDRESS:-127.0.0.1}:${BACKEND_PORT:-3001}/system/version: ok"
  fi
  echo "smoke: ok"
  ;;
up)
  dc up -d "$@"
  ;;
down)
  dc down "$@"
  ;;
*)
  usage
  ;;
esac
