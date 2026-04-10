# Operator-driven update and rollback-first (on-prem)

This CRM stack runs as Docker Compose (`docker-compose.prod.yml`). **The application does not perform upgrades or invoke Docker.** Updates are always **manual actions by the server operator** (SSH on the host).

## Release metadata

The backend exposes **`GET /system/release`** (ADMIN) with version fields populated from **environment variables** set at image build or runtime:

- `CRM_RELEASE_VERSION` — product semver (e.g. `1.2.3`)
- `GIT_SHA` — source revision
- `BUILD_TIME` — ISO UTC build timestamp
- `IMAGE_TAG` — optional image label (e.g. registry/repo:tag)

Configure these in `.env` used by Compose or inject via CI when building images. See `docker-compose.prod.yml` optional passthrough for the backend service.

## Typical upgrade procedure (high level)

1. **Backup the database** before any change (dump or snapshot), and verify the backup.
2. Pull or build new images with the desired tag; ensure the same env vars above are set so `/system/release` reflects the deployment.
3. Run **`npx prisma migrate deploy`** as part of backend startup (already in the backend `Dockerfile` `CMD`) or run it explicitly before switching traffic if your process requires it.
4. Recreate containers with `docker compose -f docker-compose.prod.yml --env-file .env up -d` (or your documented variant).

## Rollback-first

Rollback is an **infrastructure procedure**, not a button in the app:

1. **Revert to previous images** (tags known to work) via Compose.
2. If a migration was applied that is not backward-compatible, **restore the database from the pre-upgrade backup** — the product does not automate migration downgrades.

Document the previous image tag and backup location for each production upgrade.
