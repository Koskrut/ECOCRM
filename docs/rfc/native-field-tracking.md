# RFC: Native Android Field Tracking

## Problem

Expo Location + TaskManager background tracking requires a live JS runtime. On Android, the FGS can appear alive while location callbacks stop (Expo #47595 zombie FGS). Supervisors cannot trust `device.lastSeenAt` as a proxy for GPS health.

**Definition of Done:** 2-hour minimize without opening CRM, with continuous GPS samples accepted by the server.

## Solution

Native Android foreground service (expo module) captures GPS → Room → HTTP upload **without JS**. Expo tracking remains behind `legacy_expo | native_android` flag until native is proven.

## Phases

| Phase | Scope |
|-------|--------|
| 0 | Repository audit (Expo flow map) |
| 1 | Backend idempotency: `sampleId`, `deviceId`, unique per owner |
| 2 | Telemetry split: app vs native vs GPS vs server accept |
| 3 | Native spike: `crm-native-tracking` expo module |
| 4 | Service lifecycle + recovery chain |
| 5 | Room local-first + WorkManager fallback |
| 6 | B1/B2/B3 semantics in code comments |
| 7 | Feature flag, no dual writers |
| 8 | Acceptance diagnostics hooks (tests A–E) |

## API

### POST `/field/shifts/:id/samples`

```json
{
  "items": [{
    "sampleId": "uuid",
    "deviceId": "install-id",
    "lat": 50.45,
    "lng": 30.52,
    "accuracyM": 12,
    "clientRecordedAt": "2026-08-10T08:00:00.000Z",
    "source": "native_android"
  }],
  "telemetry": {
    "nativeLastSeenAt": "...",
    "lastGpsCapturedAt": "...",
    "trackingHealthState": "TRACKING_HEALTHY"
  }
}
```

Response: `{ created, duplicate, rejected, rejectReasons }`

### Team health (`GET /field/shifts/active?scope=team`)

Expose `trackingTelemetry` separately from `device.lastSeenAt` (app heartbeat).

## Tracking health states

- `TRACKING_HEALTHY`
- `NETWORK_DEGRADED`
- `LOCATION_STALE`
- `SERVICE_DEAD`
- `RECOVERY_IN_PROGRESS`
- `RECOVERY_FAILED`

## B1/B2/B3 (Phase 6)

- **B1** — GPS fix captured locally (`lastGpsCapturedAt`)
- **B2** — Sample persisted in Room before upload
- **B3** — Server accepted sample (`lastServerAcceptAt` / `created > 0`)

Supervisor-visible GPS uses B3 + stored samples, never B1 alone.

## Manual acceptance gates

- **A** — 15 min background, samples on server
- **B** — 2 h minimize, no app open, GPS continuous
- **C** — Force-stop → recovery without user action
- **D** — Airplane toggle → backlog flush
- **E** — Duplicate upload → single row

## Prod incident (2026-08-10) — do not repeat on staging

Migrations `20260810120000` + initial idempotency migration were applied on prod **before** backend `0.2.151` shipped:

1. **`FieldLocationSample.ownerId SET NOT NULL`** — backend did not yet populate `ownerId` on insert → all GPS sample POSTs failed. **Hotfix:** `ALTER COLUMN ownerId DROP NOT NULL`.
2. **Team API 500** — Prisma client expected `UserActivitySession.appLastSeenAt` / `lastServerAcceptAt` columns missing from prod until manual SQL + MOBILE backfill from `lastSeenAt`.
3. **Web empty badges** — API returned `trackingTelemetry`; older web read `telemetry`. Release `0.2.152` ships both names (`trackingTelemetry` + deprecated `telemetry` alias) and web helpers `resolveTeamTelemetry()`.

**Staging rule:** apply migration `20260810133000` and deploy backend **in the same release**. Never `SET NOT NULL ownerId` until backend always sets it on insert. Do **not** enable `native_android` on prod until acceptance gate B passes.

