# Control Plane update contract (CRM admin updater)

This document defines the minimal contract required for the in-product update button flow.

## 1) Installation update status

- **Method:** `GET`
- **Path:** `/api/installations/:installationId/updates/status`
- **Auth:** bearer token (`CONTROL_PLANE_TOKEN` or `CONTROL_PLANE_INSTALLATION_TOKEN`)

### Response

```json
{
  "latestVersion": "0.1.20",
  "targetVersion": "0.1.20"
}
```

Notes:

- `latestVersion` is the highest available release for this installation policy.
- `targetVersion` is the release CP wants this installation to run.
- `targetVersion === currentVersion` means no pending update.

## 2) Release metadata lookup

- **Method:** `GET`
- **Path:** `/api/releases/:version`
- **Auth:** bearer token

### Response

```json
{
  "version": "0.1.20",
  "gitSha": "abcdef1",
  "buildTime": "2026-05-06T11:00:00Z",
  "images": {
    "backend": "ghcr.io/koskrut/crm-core-api:0.1.20",
    "web": "ghcr.io/koskrut/crm-web:0.1.20"
  },
  "requiredModules": ["core.crm"],
  "hasMigrations": true,
  "releaseNotesUrl": "https://example/releases/0.1.20"
}
```

Notes:

- `images` are used by the host updater-agent to pin exact tags.
- `hasMigrations` indicates rollout must include migrate step.
- `requiredModules` allows compatibility checks with client entitlement before enabling the update button.

## 3) Preconditions for enabling "Update" button in CRM

CRM backend should enable update action only if all are true:

1. CP status endpoint is reachable.
2. `targetVersion` exists and is greater than current runtime version.
3. Updater agent is reachable (`/status`).
4. No active update job is running.
5. Optional: release metadata compatibility check passes.

If any precondition fails, backend returns `canUpdate=false` with human-readable `reason`.
