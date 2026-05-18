# Operator-driven update and rollback-first (on-prem)

This CRM stack runs as Docker Compose. Updates are executed by the server operator, either manually via compose commands or via a dedicated host-side updater agent.

## Operator scripts (PR-2 boundary)

From the **repository root** on the server (or with `COMPOSE_FILE` / `ENV_FILE` pointing at your paths):

1. **`scripts/operator/preflight.sh`** — **read-only** checks (Docker, compose file, `.env`, disk space, optional release env hints). Safe to run anytime. Exits non-zero if a check fails. Does not pull images or change containers.

2. **`scripts/operator/apply.sh`** — runs `docker compose … up -d --build` using `docker-compose.prod.yml` and `.env` by default. Requires an explicit flag: **`--yes`** or **`--i-understand`** (no implicit apply). Run only after backup + successful preflight. Does not run in the background and does not perform rollback.

```bash
chmod +x scripts/operator/preflight.sh scripts/operator/apply.sh
./scripts/operator/preflight.sh
# after DB backup and review:
./scripts/operator/apply.sh --yes
```

See **`docs/updater-pr2-approved-scope.md`** for scope limits (no CRM backend involvement).

## Admin button update mode (host updater agent)

If you enable the CRM "Update" button flow, run a dedicated updater agent on the host (`scripts/updater/agent.mjs`), not inside the backend container:

- backend calls updater agent HTTP API (`/status`, `/preflight`, `/apply`, `/jobs/:id`);
- updater agent runs compose operations with the client profile (`compose.base.yml + compose.client.yml`);
- updater agent updates `.env` release metadata (`CRM_RELEASE_VERSION`, `GIT_SHA`, `BUILD_TIME`, `IMAGE_TAG`) and service tags (`BACKEND_VERSION`, `WEB_VERSION`);
- rollback remains manual (previous tags + DB restore).

Important: do not mount `docker.sock` into `crm-core-api`. Docker control must stay in the host updater boundary.

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
6. If the host uses nginx in front of web/store, sync **`deploy/nginx/suprex.dental.conf`** and reload nginx — do not keep `Connection 'upgrade'` on every `location /` (see **`deploy/nginx/README.md`** §3 and §9).

## Rollback-first

Rollback is an **infrastructure procedure**, not a button in the app:

1. **Revert to previous images** (tags known to work) via Compose.
2. If a migration was applied that is not backward-compatible, **restore the database from the pre-upgrade backup** — the product does not automate migration downgrades.

The **`apply.sh`** script does **not** execute rollback. After a bad deploy, use the same compose file with previous image tags / `docker compose up -d` from known-good tags, then restore DB if needed.

**Prisma:** `migrate deploy` runs when the backend container starts. Irreversible migrations require **restore from backup**, not an automated down-migration.

Document the previous image tag and backup location for each production upgrade.
