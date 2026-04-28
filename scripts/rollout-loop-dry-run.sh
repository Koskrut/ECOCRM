#!/bin/sh
set -eu

# Optional fourth image (experimental manifest / Control Plane schema checks):
#   INCLUDE_OUTBOUND_IN_MANIFEST=true \
#   OUTBOUND_MODULE_IMAGE=ghcr.io/koskrut/crm-module-outbound:0.1.4 \
#   OUTBOUND_DIGEST=sha256:... \
#   sh scripts/rollout-loop-dry-run.sh
# Do not POST to Control Plane until CP accepts role "module_outbound" (or your chosen role).

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/.local/rollout-dry-run}"

if [ -z "${VERSION:-}" ]; then
  if TAG=$(git -C "$REPO_ROOT" describe --tags --abbrev=0 2>/dev/null); then
    VERSION=$(printf "%s" "$TAG" | sed 's/^v//')
  else
    VERSION="0.0.0-dev"
  fi
fi

CHANNEL="${CHANNEL:-stable}"
GIT_SHA="${GIT_SHA:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)}"
BUILD_TIME="${BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")}"
SOURCE_REPO="${SOURCE_REPO:-https://github.com/Koskrut/ECOCRM}"
CI_RUN_URL="${CI_RUN_URL:-local-dry-run}"

BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/koskrut/crm-backend-core:$VERSION}"
WEB_IMAGE="${WEB_IMAGE:-ghcr.io/koskrut/crm-web:$VERSION}"
STORE_IMAGE="${STORE_IMAGE:-ghcr.io/koskrut/crm-store:$VERSION}"

BACKEND_DIGEST="${BACKEND_DIGEST:-sha256:0000000000000000000000000000000000000000000000000000000000000000}"
WEB_DIGEST="${WEB_DIGEST:-sha256:1111111111111111111111111111111111111111111111111111111111111111}"
STORE_DIGEST="${STORE_DIGEST:-sha256:2222222222222222222222222222222222222222222222222222222222222222}"

INCLUDE_OUTBOUND_IN_MANIFEST="${INCLUDE_OUTBOUND_IN_MANIFEST:-false}"
OUTBOUND_MODULE_IMAGE="${OUTBOUND_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-outbound:$VERSION}"
OUTBOUND_DIGEST="${OUTBOUND_DIGEST:-sha256:3333333333333333333333333333333333333333333333333333333333333333}"

mkdir -p "$OUTPUT_DIR"
MANIFEST_PATH="$OUTPUT_DIR/deployment-manifest.json"

VERSION="$VERSION" \
CHANNEL="$CHANNEL" \
GIT_SHA="$GIT_SHA" \
BUILD_TIME="$BUILD_TIME" \
SOURCE_REPO="$SOURCE_REPO" \
CI_RUN_URL="$CI_RUN_URL" \
BACKEND_IMAGE="$BACKEND_IMAGE" \
WEB_IMAGE="$WEB_IMAGE" \
STORE_IMAGE="$STORE_IMAGE" \
BACKEND_DIGEST="$BACKEND_DIGEST" \
WEB_DIGEST="$WEB_DIGEST" \
STORE_DIGEST="$STORE_DIGEST" \
INCLUDE_OUTBOUND_IN_MANIFEST="$INCLUDE_OUTBOUND_IN_MANIFEST" \
OUTBOUND_MODULE_IMAGE="$OUTBOUND_MODULE_IMAGE" \
OUTBOUND_DIGEST="$OUTBOUND_DIGEST" \
MANIFEST_PATH="$MANIFEST_PATH" \
node <<'NODE'
const fs = require("node:fs");

function splitImage(image) {
  const index = image.lastIndexOf(":");
  if (index <= 0) throw new Error(`image must include a tag: ${image}`);
  return {
    repository: image.slice(0, index),
    tag: image.slice(index + 1),
  };
}

function assertDigest(value, name) {
  if (!/^sha256:[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a sha256 digest`);
  }
}

const backend = splitImage(process.env.BACKEND_IMAGE);
const web = splitImage(process.env.WEB_IMAGE);
const store = splitImage(process.env.STORE_IMAGE);

assertDigest(process.env.BACKEND_DIGEST, "BACKEND_DIGEST");
assertDigest(process.env.WEB_DIGEST, "WEB_DIGEST");
assertDigest(process.env.STORE_DIGEST, "STORE_DIGEST");

const includeOutbound = process.env.INCLUDE_OUTBOUND_IN_MANIFEST === "true";
if (includeOutbound) {
  assertDigest(process.env.OUTBOUND_DIGEST, "OUTBOUND_DIGEST");
  if (!process.env.OUTBOUND_MODULE_IMAGE) {
    throw new Error("OUTBOUND_MODULE_IMAGE is required when INCLUDE_OUTBOUND_IN_MANIFEST=true");
  }
}

const payload = {
  version: process.env.VERSION,
  channel: process.env.CHANNEL,
  status: "published",
  registryProvider: "ghcr",
  registryHost: "ghcr.io",
  sourceRepo: process.env.SOURCE_REPO,
  gitSha: process.env.GIT_SHA,
  ciRunUrl: process.env.CI_RUN_URL,
  builtAt: process.env.BUILD_TIME,
  composeFiles: ["compose.base.yml", "compose.client.yml"],
  moduleCodes: ["core.crm"],
  compatibility: { line: "0.1.x" },
  images: [
    {
      role: "backend_core",
      serviceName: "backend",
      imageRepository: backend.repository,
      imageTag: backend.tag,
      imageDigest: process.env.BACKEND_DIGEST,
    },
    {
      role: "web",
      serviceName: "web",
      imageRepository: web.repository,
      imageTag: web.tag,
      imageDigest: process.env.WEB_DIGEST,
    },
    {
      role: "store",
      serviceName: "store",
      imageRepository: store.repository,
      imageTag: store.tag,
      imageDigest: process.env.STORE_DIGEST,
    },
  ],
};

if (includeOutbound) {
  const outbound = splitImage(process.env.OUTBOUND_MODULE_IMAGE);
  payload.images.push({
    role: "module_outbound",
    serviceName: "backend-outbound",
    imageRepository: outbound.repository,
    imageTag: outbound.tag,
    imageDigest: process.env.OUTBOUND_DIGEST,
  });
}

for (const image of payload.images) {
  if (image.imageRepository !== image.imageRepository.toLowerCase()) {
    throw new Error(`image repository must be lowercase: ${image.imageRepository}`);
  }
}

fs.writeFileSync(process.env.MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`);
NODE

for compose_file in compose.base.yml compose.client.yml; do
  if [ ! -f "$REPO_ROOT/$compose_file" ]; then
    echo "Missing compose file referenced by manifest: $compose_file" >&2
    exit 1
  fi
done

echo "Generated dry-run manifest: $MANIFEST_PATH"
if command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/scripts/validate-deployment-manifest.mjs" "$MANIFEST_PATH" || exit 1
fi

if [ "${REGISTER_WITH_CONTROL_PLANE:-false}" = "true" ]; then
  if [ -z "${CONTROL_PLANE_URL:-}" ] || [ -z "${CONTROL_PLANE_CI_TOKEN:-}" ]; then
    echo "CONTROL_PLANE_URL and CONTROL_PLANE_CI_TOKEN are required when REGISTER_WITH_CONTROL_PLANE=true" >&2
    exit 1
  fi
  curl --fail-with-body -X POST "${CONTROL_PLANE_URL%/}/api/ci/releases/register" \
    -H "Authorization: Bearer $CONTROL_PLANE_CI_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @"$MANIFEST_PATH"
  echo
fi

if [ "${CHECK_CONTROL_PLANE_DASHBOARD:-false}" = "true" ]; then
  if [ -z "${CONTROL_PLANE_URL:-}" ] || [ -z "${ADMIN_JWT:-}" ]; then
    echo "CONTROL_PLANE_URL and ADMIN_JWT are required when CHECK_CONTROL_PLANE_DASHBOARD=true" >&2
    exit 1
  fi
  curl --fail-with-body "${CONTROL_PLANE_URL%/}/api/admin/rollouts/dashboard" \
    -H "Authorization: Bearer $ADMIN_JWT"
  echo
fi

cat <<EOF

Dry-run completed.

Next optional checks:
  REGISTER_WITH_CONTROL_PLANE=true CONTROL_PLANE_URL=... CONTROL_PLANE_CI_TOKEN=... sh scripts/rollout-loop-dry-run.sh
  CHECK_CONTROL_PLANE_DASHBOARD=true CONTROL_PLANE_URL=... ADMIN_JWT=... sh scripts/rollout-loop-dry-run.sh

This script does not run docker compose and does not mutate a client installation unless REGISTER_WITH_CONTROL_PLANE=true is set.

Optional manifest row for outbound module image:
  INCLUDE_OUTBOUND_IN_MANIFEST=true OUTBOUND_MODULE_IMAGE=... OUTBOUND_DIGEST=sha256:... sh scripts/rollout-loop-dry-run.sh
EOF
