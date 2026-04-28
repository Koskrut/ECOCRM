#!/bin/bash
set -euo pipefail

VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "0.0.0-dev")
echo "Syncing version: $VERSION"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

node - "$VERSION" "$REPO_ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const version = process.argv[2];
const repoRoot = process.argv[3];
const files = [
  "apps/backend/package.json",
  "apps/web/package.json",
  "apps/store/package.json",
];

for (const file of files) {
  const fullPath = path.join(repoRoot, file);
  const pkg = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(fullPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`updated ${file}`);
}
NODE
