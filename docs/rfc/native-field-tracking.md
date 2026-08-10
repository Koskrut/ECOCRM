# RFC: Native Android Field Tracking

## Problem

Expo Location + TaskManager background tracking requires a live JS runtime. On Android, the FGS can appear alive while location callbacks stop (Expo #47595 zombie FGS). Supervisors cannot trust `device.lastSeenAt` as a proxy for GPS health.

**Definition of Done:** 2-hour minimize without opening CRM, with continuous GPS samples accepted by the server.

## Solution

Native Android foreground service (expo module) captures GPS → Room → HTTP upload **without JS**. Expo tracking remains behind `legacy_expo | native_android` flag until native is proven.

## Feature flag / preview builds

| Profile | `EXPO_PUBLIC_FIELD_TRACKING_MODE` | Audience |
|---------|-----------------------------------|----------|
| `preview` (default) | `legacy_expo` | Normal internal APK |
| `preview-native` | `native_android` | Smoke + 1–2 field devices only |
| `production` | unset → `legacy_expo` | Do **not** enable native until Test B passes |

Build native preview:

```bash
cd apps/mobile
EAS_NO_VCS=1 EAS_PROJECT_ROOT=$(pwd) npx eas-cli build \
  --profile preview-native --platform android --non-interactive
```

**Do not** set `native_android` on the default `preview` or production EAS env — that would ship native to all internal/prod users.

## Phases

| Phase | Scope |
|-------|--------|
| 0 | Repository audit (Expo flow map) |
| 1 | Backend idempotency: `sampleId`, `deviceId`, unique per owner |
| 2 | Telemetry split: app vs native vs GPS vs server accept |
| 3 | Native spike: `crm-native-tracking` expo module |
| 4 | Service lifecycle + recovery chain |
| 5 | Room local-first + WorkManager flush fallback |
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

---

## Manual acceptance gates (physical devices)

Prefer **Samsung** and **Xiaomi** (aggressive OEM battery killers). Install the `preview-native` APK only.

### Preconditions (all tests)

1. Install APK from `preview-native` EAS build (not default `preview`).
2. Confirm build embeds native mode: in-app diagnostics / log → `fieldTrackingMode=native_android`, `moduleLoaded=true`.
3. Login as field manager; grant **Allow all the time** location + notifications.
4. On Xiaomi/Samsung: disable battery optimization for CRM (Settings → Battery → unrestricted / no restrictions).
5. Start ACTIVE shift with tracking enabled; confirm ongoing notification **«CRM — зміна активна» / Native GPS tracking**.
6. Supervisor `/visits/team` (or DB) shows samples with `source=native_android` within ~1–2 minutes.

### Test A — short background (15 min)

1. Start shift outdoors / near window (GPS lock).
2. Press Home (minimize). Do **not** open CRM.
3. Wait **15 minutes**.
4. **Pass:** server has continuous samples across the window (gaps ≪ 2–3 min under open sky). Notification still present.

### Test B — 2 h minimize DoD (gate for prod native)

1. Start shift; confirm first B3 accept on server.
2. Press Home. Lock screen optional. **Do not open CRM** for the full window.
3. Leave device normal (Wi‑Fi or mobile data). Avoid airplane mode for this test.
4. Wait **≥ 2 hours** without interacting with the CRM app.
5. After 2h, open supervisor map/team (or query samples) **without** requiring the field phone to have been opened.
6. **Pass criteria:**
   - Continuous `native_android` samples for ~2h (no multi-hour gap).
   - Ongoing FGS notification still shown (or was shown throughout — check OEM didn’t kill it).
   - `trackingTelemetry.lastServerAcceptAt` / samples stay fresh (B3), not only app heartbeat.
7. **Fail / invalid:**
   - Opening CRM mid-test to “nudge” GPS.
   - `adb shell am force-stop …` then treating recovery as a pass — **force-stop is Test C, not Test B**.
   - Using default `preview` (`legacy_expo`) APK.

### Test C — force-stop recovery (brief)

1. With active native tracking, `adb shell am force-stop dental.suprex.crm.manager` (or App info → Force stop).
2. **Expect:** GPS stops (OS killed FGS). This is **not** a Test B failure.
3. Open CRM (foreground). App should re-sync session + restart native FGS for ACTIVE shift.
4. **Pass:** new samples resume after open without manual “Restart tracking” (or restart works as fallback).

### Test D — airplane toggle / backlog (brief)

1. During active native tracking, enable Airplane mode 5–10 min, then disable.
2. **Pass:** Room backlog flushes; server receives delayed `sampleId`s; duplicates tolerated (`duplicate > 0` OK).

### Test E — idempotent duplicate (brief)

1. Capture a `sampleId` already accepted (or re-upload via flush).
2. **Pass:** second POST yields `duplicate ≥ 1`, single DB row for `(ownerId, deviceId, sampleId)`.

### Sign-off

- [ ] Test A pass on Samsung **or** Xiaomi  
- [ ] **Test B pass** on Samsung **and** preferably Xiaomi  
- [ ] Tests C / D / E smoke pass  
- [ ] Only then consider enabling `native_android` beyond `preview-native`

---

## Prod incident (2026-08-10) — do not repeat on staging

Migrations `20260810120000` + initial idempotency migration were applied on prod **before** backend `0.2.151` shipped:

1. **`FieldLocationSample.ownerId SET NOT NULL`** — backend did not yet populate `ownerId` on insert → all GPS sample POSTs failed. **Hotfix:** `ALTER COLUMN ownerId DROP NOT NULL`.
2. **Team API 500** — Prisma client expected `UserActivitySession.appLastSeenAt` / `lastServerAcceptAt` columns missing from prod until manual SQL + MOBILE backfill from `lastSeenAt`.
3. **Web empty badges** — API returned `trackingTelemetry`; older web read `telemetry`. Release `0.2.152` ships both names (`trackingTelemetry` + deprecated `telemetry` alias) and web helpers `resolveTeamTelemetry()`.

**Staging rule:** apply migration `20260810133000` and deploy backend **in the same release**. Never `SET NOT NULL ownerId` until backend always sets it on insert. Do **not** enable `native_android` on prod until acceptance gate B passes.
