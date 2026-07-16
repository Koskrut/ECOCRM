# OSRM routing (Ukraine)

Self-hosted [OSRM](https://project-osrm.org/) provides visit km, duration, map polylines, and GPS track snapping.

Backend code uses **OSRM only** for road geometry (Google Maps key remains for **map tiles / geocoding**, not route distance). Without a reachable OSRM, metrics fall back to haversine (`source: fallback` / «без доріг»).

## Requirements

- Docker on a **build machine** (16 GB RAM recommended for graph build)
- ~15 GB disk for Ukraine extract + processed graph
- On the CRM host: graph files under **`/opt/crm/osrm-data/`** (or `OSRM_DATA_HOST`)
- Backend env (set by `compose.client.yml`): `OSRM_BASE_URL=http://osrm:5000`, `ROUTING_PROFILE=car`

## Build graph (offline)

```bash
chmod +x deploy/osrm/build-ukraine-graph.sh
./deploy/osrm/build-ukraine-graph.sh
```

Output defaults to `deploy/osrm/data/ukraine.osrm*`.

```bash
OSRM_DATA_DIR=/tmp/osrm-build ./deploy/osrm/build-ukraine-graph.sh
```

**Do not** run extract/partition/customize on the production VPS while CRM is under load.

## Deploy — SUPREX / install bundle (`compose.base` + `compose.client`)

From **0.2.110+**, `compose.client.yml` defines the **`osrm`** service and injects `OSRM_BASE_URL` into **`backend`**.

1. Copy graph files to the server (outside git):

```bash
sudo mkdir -p /opt/crm/osrm-data
rsync -avz deploy/osrm/data/ukraine.osrm* user@your-vps:/opt/crm/osrm-data/
```

Override path with **`OSRM_DATA_HOST`** in `suprex/.env` if needed.

2. Sync compose from the release manifest (or pull agent), then:

```bash
cd /opt/crm
docker compose $(…same -f as composeFiles…) up -d osrm
docker compose … up -d backend   # picks up OSRM_BASE_URL from compose.client.yml
```

3. Smoke test:

```bash
docker compose … exec backend wget -qO- \
  'http://osrm:5000/route/v1/car/30.5234,50.4501;30.5240,50.4510?overview=false'
```

Or CRM admin: **`GET /system/routing-health`**.

Backend does **not** hard-depend on OSRM: the stack starts even if the graph is missing (OSRM container may restart until data is present).

## Deploy — standalone `docker-compose.prod.yml`

Same graph path; volume name `osrm_data` or bind as documented in that file:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d osrm backend
```

## Update OSM data

Every 1–2 weeks (off-hours):

1. Re-run `build-ukraine-graph.sh` on a build machine.
2. `rsync` new `ukraine.osrm*` to the VPS data dir.
3. `docker compose … restart osrm`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No `osrm` container / straight lines | Release **&lt; 0.2.110** used only `docker-compose.prod.yml`; upgrade so `compose.client.yml` includes `osrm` + `OSRM_BASE_URL` |
| `No route found` / `NoSegment` | Coordinates outside Ukraine extract; check visit coords |
| Backend `source: fallback` | OSRM down, empty `/data`, or wrong `OSRM_BASE_URL`; `docker logs` on `osrm` |
| High RAM on VPS | Build graph offline; runtime `osrm-routed` uses ~2–4 GB |

Google Maps API key in CRM Settings is still used for **map tiles** and **geocoding** only — not for route distance billing.
