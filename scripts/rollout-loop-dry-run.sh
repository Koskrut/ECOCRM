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
CORE_IMAGE="${CORE_IMAGE:-ghcr.io/koskrut/crm-core-api:$VERSION}"
CORE_DIGEST="${CORE_DIGEST:-sha256:4444444444444444444444444444444444444444444444444444444444444444}"
WEB_DIGEST="${WEB_DIGEST:-sha256:1111111111111111111111111111111111111111111111111111111111111111}"
STORE_DIGEST="${STORE_DIGEST:-sha256:2222222222222222222222222222222222222222222222222222222222222222}"

INCLUDE_OUTBOUND_IN_MANIFEST="${INCLUDE_OUTBOUND_IN_MANIFEST:-false}"
MODULES="${MODULES:-}"
OUTBOUND_MODULE_IMAGE="${OUTBOUND_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-outbound:$VERSION}"
OUTBOUND_DIGEST="${OUTBOUND_DIGEST:-sha256:3333333333333333333333333333333333333333333333333333333333333333}"
GOOGLE_SHEET_MODULE_IMAGE="${GOOGLE_SHEET_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-google-sheet:$VERSION}"
GOOGLE_SHEET_DIGEST="${GOOGLE_SHEET_DIGEST:-sha256:5555555555555555555555555555555555555555555555555555555555555555}"
RINGOSTAT_MODULE_IMAGE="${RINGOSTAT_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-ringostat:$VERSION}"
RINGOSTAT_DIGEST="${RINGOSTAT_DIGEST:-sha256:6666666666666666666666666666666666666666666666666666666666666666}"
BITRIX_MODULE_IMAGE="${BITRIX_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-bitrix:$VERSION}"
BITRIX_DIGEST="${BITRIX_DIGEST:-sha256:7777777777777777777777777777777777777777777777777777777777777777}"
NP_MODULE_IMAGE="${NP_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-np:$VERSION}"
NP_DIGEST="${NP_DIGEST:-sha256:8888888888888888888888888888888888888888888888888888888888888888}"
FINANCE_MODULE_IMAGE="${FINANCE_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-finance:$VERSION}"
FINANCE_DIGEST="${FINANCE_DIGEST:-sha256:9999999999999999999999999999999999999999999999999999999999999999}"
PLANNING_MODULE_IMAGE="${PLANNING_MODULE_IMAGE:-ghcr.io/koskrut/crm-module-planning:$VERSION}"
PLANNING_DIGEST="${PLANNING_DIGEST:-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"

mkdir -p "$OUTPUT_DIR"
MANIFEST_PATH="$OUTPUT_DIR/deployment-manifest.json"

VERSION="$VERSION" \
CHANNEL="$CHANNEL" \
GIT_SHA="$GIT_SHA" \
BUILD_TIME="$BUILD_TIME" \
SOURCE_REPO="$SOURCE_REPO" \
CI_RUN_URL="$CI_RUN_URL" \
BACKEND_IMAGE="$BACKEND_IMAGE" \
CORE_IMAGE="$CORE_IMAGE" \
WEB_IMAGE="$WEB_IMAGE" \
STORE_IMAGE="$STORE_IMAGE" \
BACKEND_DIGEST="$BACKEND_DIGEST" \
CORE_DIGEST="$CORE_DIGEST" \
WEB_DIGEST="$WEB_DIGEST" \
STORE_DIGEST="$STORE_DIGEST" \
INCLUDE_OUTBOUND_IN_MANIFEST="$INCLUDE_OUTBOUND_IN_MANIFEST" \
MODULES="$MODULES" \
OUTBOUND_MODULE_IMAGE="$OUTBOUND_MODULE_IMAGE" \
OUTBOUND_DIGEST="$OUTBOUND_DIGEST" \
GOOGLE_SHEET_MODULE_IMAGE="$GOOGLE_SHEET_MODULE_IMAGE" \
GOOGLE_SHEET_DIGEST="$GOOGLE_SHEET_DIGEST" \
RINGOSTAT_MODULE_IMAGE="$RINGOSTAT_MODULE_IMAGE" \
RINGOSTAT_DIGEST="$RINGOSTAT_DIGEST" \
BITRIX_MODULE_IMAGE="$BITRIX_MODULE_IMAGE" \
BITRIX_DIGEST="$BITRIX_DIGEST" \
NP_MODULE_IMAGE="$NP_MODULE_IMAGE" \
NP_DIGEST="$NP_DIGEST" \
FINANCE_MODULE_IMAGE="$FINANCE_MODULE_IMAGE" \
FINANCE_DIGEST="$FINANCE_DIGEST" \
PLANNING_MODULE_IMAGE="$PLANNING_MODULE_IMAGE" \
PLANNING_DIGEST="$PLANNING_DIGEST" \
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
const coreApi = splitImage(process.env.CORE_IMAGE);
const web = splitImage(process.env.WEB_IMAGE);
const store = splitImage(process.env.STORE_IMAGE);

assertDigest(process.env.BACKEND_DIGEST, "BACKEND_DIGEST");
assertDigest(process.env.CORE_DIGEST, "CORE_DIGEST");
assertDigest(process.env.WEB_DIGEST, "WEB_DIGEST");
assertDigest(process.env.STORE_DIGEST, "STORE_DIGEST");

function resolveModulesCsv() {
  const raw = process.env.MODULES ?? "";
  const legacy = process.env.INCLUDE_OUTBOUND_IN_MANIFEST === "true";
  const { execFileSync } = require("node:child_process");
  const path = require("node:path");
  const script = path.join(__dirname, "resolve-modules-csv.mjs");
  return execFileSync(process.execPath, [script, raw, legacy ? "true" : "false"], { encoding: "utf8" }).trim();
}

const MODULE_MAP = {
  outbound: {
    role: "module_outbound",
    serviceName: "backend-outbound",
    moduleCode: "ext.voice_outbound",
    imageVar: "OUTBOUND_MODULE_IMAGE",
    digestVar: "OUTBOUND_DIGEST",
    compose: ["compose.modules.outbound.yml", "compose.modules.outbound-sidecar.yml"],
  },
  "google-sheet": {
    role: "module_google_sheet",
    serviceName: "backend-google-sheet",
    moduleCode: "int.google_sheet",
    imageVar: "GOOGLE_SHEET_MODULE_IMAGE",
    digestVar: "GOOGLE_SHEET_DIGEST",
    compose: ["compose.modules.google-sheet.yml", "compose.modules.google-sheet-sidecar.yml"],
  },
  ringostat: {
    role: "module_ringostat",
    serviceName: "backend-ringostat",
    moduleCode: "int.ringostat",
    imageVar: "RINGOSTAT_MODULE_IMAGE",
    digestVar: "RINGOSTAT_DIGEST",
    compose: ["compose.modules.ringostat.yml", "compose.modules.ringostat-sidecar.yml"],
  },
  bitrix: {
    role: "module_bitrix",
    serviceName: "backend-bitrix",
    moduleCode: "int.bitrix",
    imageVar: "BITRIX_MODULE_IMAGE",
    digestVar: "BITRIX_DIGEST",
    compose: ["compose.modules.bitrix.yml", "compose.modules.bitrix-sidecar.yml"],
  },
  np: {
    role: "module_np",
    serviceName: "backend-np",
    moduleCode: "int.nova_poshta",
    imageVar: "NP_MODULE_IMAGE",
    digestVar: "NP_DIGEST",
    compose: ["compose.modules.np.yml", "compose.modules.np-sidecar.yml"],
  },
  finance: {
    role: "module_finance",
    serviceName: "backend-finance",
    moduleCode: "ext.finance",
    imageVar: "FINANCE_MODULE_IMAGE",
    digestVar: "FINANCE_DIGEST",
    compose: ["compose.modules.finance.yml", "compose.modules.finance-sidecar.yml"],
  },
  planning: {
    role: "module_planning",
    serviceName: "backend-planning",
    moduleCode: "ext.production_planning",
    imageVar: "PLANNING_MODULE_IMAGE",
    digestVar: "PLANNING_DIGEST",
    compose: ["compose.modules.planning.yml", "compose.modules.planning-sidecar.yml"],
  },
};

const modulesCsv = resolveModulesCsv();
const moduleSlugs = modulesCsv ? modulesCsv.split(",").map((s) => s.trim()).filter(Boolean) : [];

for (const slug of moduleSlugs) {
  const spec = MODULE_MAP[slug];
  if (!spec) throw new Error(`Unknown module slug: ${slug}`);
  const img = process.env[spec.imageVar];
  const dig = process.env[spec.digestVar];
  if (!img) throw new Error(`${spec.imageVar} required for module ${slug}`);
  assertDigest(dig, spec.digestVar);
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
      role: "other",
      serviceName: "crm-core-api",
      imageRepository: coreApi.repository,
      imageTag: coreApi.tag,
      imageDigest: process.env.CORE_DIGEST,
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

const moduleCodes = new Set(["core.crm"]);
for (const slug of moduleSlugs) {
  const spec = MODULE_MAP[slug];
  const modImg = splitImage(process.env[spec.imageVar]);
  payload.images.push({
    role: spec.role,
    serviceName: spec.serviceName,
    moduleCode: spec.moduleCode,
    imageRepository: modImg.repository,
    imageTag: modImg.tag,
    imageDigest: process.env[spec.digestVar],
  });
  moduleCodes.add(spec.moduleCode);
  for (const cf of spec.compose) {
    if (!payload.composeFiles.includes(cf)) payload.composeFiles.push(cf);
  }
}
payload.moduleCodes = [...moduleCodes];

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
REPO_ROOT="$REPO_ROOT" MANIFEST_PATH="$MANIFEST_PATH" node <<'CHK' || exit 1
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.REPO_ROOT || path.join(__dirname, "..");
const mp = process.env.MANIFEST_PATH || ".local/rollout-dry-run/deployment-manifest.json";
const p = path.isAbsolute(mp) ? mp : path.join(root, mp);
const doc = JSON.parse(fs.readFileSync(p, "utf8"));
for (const cf of doc.composeFiles || []) {
  const fp = path.join(root, cf);
  if (!fs.existsSync(fp)) {
    console.error("Missing compose file referenced by manifest:", cf);
    process.exit(1);
  }
}
CHK

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
