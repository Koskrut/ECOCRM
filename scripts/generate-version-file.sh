#!/bin/sh
set -eu

if [ -z "${VERSION:-}" ]; then
  if TAG=$(git describe --tags --abbrev=0 2>/dev/null); then
    VERSION=$(printf "%s" "$TAG" | sed 's/^v//')
  else
    VERSION="0.0.0-dev"
  fi
fi
COMMIT=${COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}
BUILT_AT=${BUILT_AT:-$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
VERSION_FILE="$REPO_ROOT/apps/backend/src/version.ts"

mkdir -p "$(dirname "$VERSION_FILE")"
cat > "$VERSION_FILE" <<EOF
// AUTO-GENERATED, DO NOT EDIT
export const VERSION = "$VERSION";
export const COMMIT_SHA = "$COMMIT";
export const BUILT_AT = "$BUILT_AT";
EOF

echo "Generated $VERSION_FILE ($VERSION, $COMMIT, $BUILT_AT)"
