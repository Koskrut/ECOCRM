# Operator-driven update and rollback-first (on-prem)

This CRM stack runs as Docker Compose (`docker-compose.prod.yml`). **The application does not perform upgrades or invoke Docker.** Updates are always **manual actions by the server operator** (SSH on the host).

## Operator scripts (PR-2 boundary)

From the **repository root** on the server (or with `COMPOSE_FILE` / `ENV_FILE` pointing at your paths):

1. **`scripts/operator/preflight.sh`** — **read-only** checks (Docker, compose file, `.env`, disk space, optional release env hints). Safe to run anytime. Exits non-zero if a check fails. Does not pull images or change containers.

2. **`scripts/operator/apply.sh`** — runs `docker compose … up -d --build` using `docker-compose.prod.yml` and `.env`. Requires an explicit flag: **`--yes`** or **`--i-understand`** (no implicit apply). Run only after backup + successful preflight. Does not run in the background and does not perform rollback.

```bash
chmod +x scripts/operator/preflight.sh scripts/operator/apply.sh
./scripts/operator/preflight.sh
# after DB backup and review:
./scripts/operator/apply.sh --yes
```

See **`docs/updater-pr2-approved-scope.md`** for scope limits (no CRM backend involvement).

## Release metadata

The backend exposes **`GET /system/release`** (ADMIN) with version fields populated from **environment variables** set at image build or runtime:

- `CRM_RELEASE_VERSION` — product semver (e.g. `1.2.3`)
- `GIT_SHA` — source revision
- `BUILD_TIME` — ISO UTC build timestamp
- `IMAGE_TAG` — optional image label (e.g. registry/repo:tag)

Configure these in `.env` used by Compose or inject via CI when building images. See `docker-compose.prod.yml` optional passthrough for the backend service.

## Typical upgrade procedure (high level)

1. **Backup the database** before any change (dump or snapshot), and verify the backup.
2. Run **`./scripts/operator/preflight.sh`** and resolve any failures.
3. Pull or build new images with the desired tag; ensure the same env vars above are set so **`GET /system/release`** reflects the deployment after upgrade.
4. Run **`npx prisma migrate deploy`** as part of backend startup (already in the backend `Dockerfile` `CMD`) or run it explicitly before switching traffic if your process requires it.
5. Recreate containers with **`./scripts/operator/apply.sh --yes`** (or `--i-understand`), or run `docker compose -f docker-compose.prod.yml --env-file .env up -d --build` manually — same idea.

## Rollback-first

Rollback is an **infrastructure procedure**, not a button in the app:

1. **Revert to previous images** (tags known to work) via Compose.
2. If a migration was applied that is not backward-compatible, **restore the database from the pre-upgrade backup** — the product does not automate migration downgrades.

The **`apply.sh`** script does **not** execute rollback. After a bad deploy, use the same compose file with previous image tags / `docker compose up -d` from known-good tags, then restore DB if needed.

**Prisma:** `migrate deploy` runs when the backend container starts. Irreversible migrations require **restore from backup**, not an automated down-migration.

Document the previous image tag and backup location for each production upgrade.
