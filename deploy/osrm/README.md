# OSRM routing (Ukraine)

Self-hosted [OSRM](https://project-osrm.org/) replaces Google Routes for visit km, duration, map polylines, and GPS track snapping.

## Requirements

- Docker on build machine (16 GB RAM recommended for graph build)
- ~15 GB disk for Ukraine extract + processed graph
- CRM backend env: `OSRM_BASE_URL=http://osrm:5000`, `ROUTING_PROFILE=car`

## Build graph (offline)

```bash
chmod +x deploy/osrm/build-ukraine-graph.sh
./deploy/osrm/build-ukraine-graph.sh
```

Output defaults to `deploy/osrm/data/ukraine.osrm*`.

Override:

```bash
OSRM_DATA_DIR=/tmp/osrm-build ./deploy/osrm/build-ukraine-graph.sh
```

**Do not** run extract/partition/customize on the production VPS while CRM is under load.

## Deploy to Netcup VPS

1. Copy graph files to the server (outside git):

```bash
rsync -avz deploy/osrm/data/ukraine.osrm* user@your-vps:/opt/crm/osrm-data/
```

2. Mount volume in `docker-compose.prod.yml` (`osrm_data` → `/opt/crm/osrm-data` on host via bind or named volume populated by rsync).

3. Start stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d osrm backend
```

4. Smoke test from backend container:

```bash
docker compose -f docker-compose.prod.yml exec backend wget -qO- \
  'http://osrm:5000/route/v1/car/30.5234,50.4501;30.5240,50.4510?overview=false'
```

Or CRM admin: `GET /system/routing-health`.

## Update OSM data

Every 1–2 weeks (off-hours):

1. Re-run `build-ukraine-graph.sh` on a build machine.
2. `rsync` new `ukraine.osrm*` to VPS.
3. `docker compose -f docker-compose.prod.yml restart osrm`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No route found` / `NoSegment` | Coordinates outside Ukraine extract; check visit coords |
| Backend `source: fallback` | OSRM down or wrong `OSRM_BASE_URL`; check `docker logs` on `osrm` |
| High RAM on VPS | Ensure graph **build** runs offline; runtime `osrm-routed` uses ~2–4 GB |

Google Maps API key in CRM Settings is still used for **map tiles** and **geocoding** only — not for route distance billing.
