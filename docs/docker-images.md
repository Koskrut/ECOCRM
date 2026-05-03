# Docker Images

## Image Naming Convention

Production delivery images are pulled from GHCR using lowercase names:

- `ghcr.io/koskrut/crm-backend-core:<version>` (full Nest `AppModule`, default)
- `ghcr.io/koskrut/crm-core-api:<version>` (Docker target `core-runner`, `AppModuleCore`)
- `ghcr.io/koskrut/crm-web:<version>`
- `ghcr.io/koskrut/crm-store:<version>`
- `ghcr.io/koskrut/crm-module-<name>:<version>`

Examples:

- `ghcr.io/koskrut/crm-backend-core:0.1.0`
- `ghcr.io/koskrut/crm-web:0.1.0`
- `ghcr.io/koskrut/crm-store:0.1.0`
- `ghcr.io/koskrut/crm-module-outbound:0.1.0`

Dockerfile targets on `apps/backend/Dockerfile` (same context as backend):

| Target | Process | `BACKEND_VARIANT` |
|--------|---------|-------------------|
| `core-runner` | `core-main.js` | `core` |
| `outbound-runner` | `outbound-main.js` | `outbound_worker` |
| `google-sheet-runner` | `google-sheet-main.js` | `google_sheet_worker` |
| `ringostat-runner` | `ringostat-main.js` | `ringostat_worker` |
| `bitrix-runner` | `bitrix-main.js` | `bitrix_worker` |
| `np-runner` | `np-main.js` | `np_worker` |
| `finance-runner` | `finance-main.js` | `finance_worker` |
| `planning-runner` | `planning-main.js` | `planning_worker` |

Example module build:

```bash
docker build -f apps/backend/Dockerfile --target np-runner -t ghcr.io/koskrut/crm-module-np:0.1.0 .
```

GHCR requires lowercase repository names. Keep the `ghcr.io/koskrut/...` prefix lowercase.

## Versioning

Git tags are the source of truth for release versions:

1. Create a tag: `git tag v0.1.0`.
2. Sync app package versions: `./scripts/sync-versions.sh`.
3. Generate backend runtime metadata: `./scripts/generate-version-file.sh`.
4. Build images using the tag without the leading `v`.

`v1.0.0` is reserved for the first paid production client. Until then, release tags stay in `0.x`.

## Label Convention

All production images use OCI labels:

- `org.opencontainers.image.title`
- `org.opencontainers.image.version`
- `org.opencontainers.image.source`
- `org.opencontainers.image.revision`

## Manual Build Commands

Backend and web builds use the repository root as Docker context because they depend on shared `packages/*`.

```bash
VERSION=0.1.0
SHA=$(git rev-parse --short HEAD)

docker build \
  -f apps/backend/Dockerfile \
  --build-arg IMAGE_VERSION="$VERSION" \
  --build-arg VCS_REF="$SHA" \
  --build-arg CRM_RELEASE_VERSION="$VERSION" \
  --build-arg GIT_SHA="$SHA" \
  --build-arg BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")" \
  --build-arg IMAGE_TAG="ghcr.io/koskrut/crm-backend-core:$VERSION" \
  -t ghcr.io/koskrut/crm-backend-core:$VERSION \
  .

docker build \
  -f apps/backend/Dockerfile \
  --target migrate \
  --build-arg IMAGE_VERSION="$VERSION" \
  --build-arg VCS_REF="$SHA" \
  -t ghcr.io/koskrut/crm-backend-core:$VERSION-migrate \
  .

docker build \
  -f apps/web/Dockerfile \
  --build-arg IMAGE_VERSION="$VERSION" \
  --build-arg VCS_REF="$SHA" \
  -t ghcr.io/koskrut/crm-web:$VERSION \
  .

docker build \
  -f apps/store/Dockerfile \
  --build-arg IMAGE_VERSION="$VERSION" \
  --build-arg VCS_REF="$SHA" \
  -t ghcr.io/koskrut/crm-store:$VERSION \
  ./apps/store
```

Run migrations as a separate one-off container:

```bash
docker run --rm \
  --env DATABASE_URL="postgresql://crm:password@postgres:5432/crm" \
  ghcr.io/koskrut/crm-backend-core:0.1.0-migrate
```

The backend runtime image starts only the API process and does not run `prisma migrate deploy` in its entrypoint.

## Baseline Image Sizes

Fill these after the first local build:

| Image | Version | Size |
| --- | --- | --- |
| `ghcr.io/koskrut/crm-backend-core` | `0.1.0` | 1.1GB |
| `ghcr.io/koskrut/crm-backend-core` migrate target | `0.1.0-migrate` | 1.1GB |
| `ghcr.io/koskrut/crm-web` | `0.1.0` | 300MB |
| `ghcr.io/koskrut/crm-store` | `0.1.0` | 275MB |

## Migration Plan

The current `docker-compose.prod.yml` remains unchanged during D1. Track D will add registry-based compose files in later commits:

- D2: `compose.base.yml`
- D3: module overlays
- D4: `compose.client.yml` and legacy compose rename
- D5: compatibility window
