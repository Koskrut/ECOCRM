#!/usr/bin/env bash
# Build OSRM MLD graph for Ukraine (OpenStreetMap).
# Run offline — peak RAM ~8–12 GB during customize. Do not run on production CRM host during business hours.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OSRM_DATA_DIR:-${SCRIPT_DIR}/data}"
PBF_URL="${OSRM_PBF_URL:-https://download.geofabrik.de/europe/ukraine-latest.osm.pbf}"
PBF_NAME="ukraine-latest.osm.pbf"
PROFILE="${OSRM_PROFILE:-/opt/car.lua}"
IMAGE="${OSRM_IMAGE:-osrm/osrm-backend:latest}"

mkdir -p "${OUT_DIR}"

if [[ ! -f "${OUT_DIR}/${PBF_NAME}" ]]; then
  echo "Downloading ${PBF_URL} ..."
  curl -fL "${PBF_URL}" -o "${OUT_DIR}/${PBF_NAME}"
fi

echo "Extracting ..."
docker run --rm -t -v "${OUT_DIR}:/data" "${IMAGE}" \
  osrm-extract -p "${PROFILE}" "/data/${PBF_NAME}" -o /data/ukraine.osrm

echo "Partitioning (MLD) ..."
docker run --rm -t -v "${OUT_DIR}:/data" "${IMAGE}" \
  osrm-partition /data/ukraine.osrm

echo "Customizing ..."
docker run --rm -t -v "${OUT_DIR}:/data" "${IMAGE}" \
  osrm-customize /data/ukraine.osrm

echo "Done. Graph files in ${OUT_DIR}:"
ls -lh "${OUT_DIR}"/ukraine.osrm* 2>/dev/null || ls -lh "${OUT_DIR}"

echo ""
echo "Deploy to VPS:"
echo "  rsync -avz ${OUT_DIR}/ukraine.osrm* user@vps:/opt/crm/osrm-data/"
echo "  docker compose -f docker-compose.prod.yml restart osrm"
