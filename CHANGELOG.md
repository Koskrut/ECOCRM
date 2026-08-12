# Changelog

Все значимые изменения монорепозитория фиксируются здесь (кратко). Детали модульности — `docs/CRM-modularity-structure.md`, статус фаз — `docs/module-split-progress.md`.

## Unreleased

_(планируемые изменения после **0.2.158**.)_

## [0.2.158] — 2026-08-12

### Summary

Hotfix **0.2.158**: backend tsc fix for 1C payments import staging JSON (0.2.157 CI fail).

### Fixed

- **1C payments import**: `StagingSummary` parse from Prisma `JsonValue` via `unknown` cast helper.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.158`**.
- **Do not use 0.2.157 images** — CI failed on backend build.
- Same migrations/features as **0.2.157** (`20260812140000_add_one_c_payments_import`).

## [0.2.157] — 2026-08-12

### Summary

Патч **0.2.157**: импорт оплат из 1С (Excel → match → Payment); сортировка/срочность задач; assignees scope для users.

### Added

- **1C Payments Import** (`int.1c_payments`): загрузка `.xlsb`/`.xlsx`, preview с match по заказам/контрагентам, ручные overrides, commit с `PaymentSourceType.ONE_C` и dedup по `oneCImportKey`.
- **Web `/settings/integrations/1c-payments`**: UI импорта, API proxy routes.
- **Tasks priority sort**: Kyiv timezone urgency buckets (overdue / today / upcoming); `sortBy=priority` на backend и web tasks page (views, grouping, badges).
- **Users `scope=assignees`**: облегчённый список для селекторов исполнителей.

### Changed

- **Order payment block**: отдельная секция оплат из 1С.
- **Tasks page**: фильтры «прострочені» / «сьогодні», группировка по срочности, визуальные метки urgency.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.157`**.
- **Миграции:** `20260812140000_add_one_c_payments_import` — **`prisma migrate deploy`** (`PaymentSourceType.ONE_C`, `Payment.oneCImportKey`).
- **Модуль:** включить **`int.1c_payments`** в entitlements / module manifest при необходимости.

## [0.2.156] — 2026-08-11

### Summary

Hotfix **0.2.156**: web kanban locale keys for returns board (0.2.155 CI fail).

### Fixed

- **Web ReturnsKanban**: `returnsInvalidTransition` and related `kanban.*` strings in en/uk.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.156`**.
- **Do not use 0.2.155 images** — CI failed on web build.

## [0.2.155] — 2026-08-11

### Summary

Патч **0.2.155**: factory/return external codes; returns kanban transitions; planning packable-only + factory draft approve; contact operational debt; native FGS restart.

### Added

- **Factory order**: `externalCode`, `approvedAt`/`approvedById`; draft-only edit; approve then assign 1C code.
- **Order return**: `externalCode` + PATCH; warehouse-role create guard.
- **Planning**: packable-from-parts filter for proposed packing lines; factory draft lifecycle helpers.

### Changed

- **Web returns kanban**: allowed status transitions (mis-pick checklist).
- **Web contacts/orders**: operational debt vs «до оплати» KPI.
- **Planning UI**: factory approve / external code; packable packing lists.
- **Mobile native GPS**: restart tracking actually recovers FGS; clear accept telemetry + restart counter.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.155`**.
- **Миграции:** `20260811140000_factory_order_external_code`, `20260811150000_order_return_external_code` — **`prisma migrate deploy`**.
- **Mobile:** новый EAS если нужен native FGS restart fix (`preview-native`).

## [0.2.154] — 2026-08-11

### Summary

Патч **0.2.154**: утверждение маршрута (OSRM-only); движение заказов на карточке контакта; Planning Today awaiting stock; native Android GPS EAS/recovery hardening.

### Added

- **Route plan confirm**: `RoutePlan.confirmedAt`; confirm blocked without OSRM geometry; session start requires confirm.
- **Contact orders movement**: `GET /contacts/:id/orders-movement` — children/returns/payments on web + mobile contact card.
- **Planning Today awaiting stock**: grouped remaining AWAITING_STOCK lines by SKU with stock gap.

### Changed

- **Mobile native GPS** (opt-in `preview-native`): Room upload queue on server reject; FGS recovery after accept purge; no dual-writer false alerts; Always-permission probe; JWT retry before flush skip; EAS Gradle/KSP/Node 24 fixes.
- **Web visits**: planned-map geometry from confirmed OSRM plan; confirm CTA.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.154`**.
- **Миграция:** `20260811120000_route_plan_confirmed_at` — **`prisma migrate deploy`**.
- **Mobile:** новый EAS build; native tracking всё ещё opt-in (`preview-native`), default `legacy_expo`.
- **Web:** deploy для confirm route + contact movement + planning awaiting stock.

## [0.2.153] — 2026-08-10

### Summary

Patch **0.2.153**: Expo flush telemetry for supervisor observability; ghost-duplicate accept fix; purge pending buffer on shift change.

### Fixed

- **Mobile Expo flush**: POST `/field/shifts/:id/samples` includes `telemetry` (`appLastSeenAt`, `lastGpsCapturedAt`) so supervisors see GPS pipeline state when FGS is alive but samples stall.
- **Mobile shift change**: `purgePendingSamples()` before binding a new `ACTIVE_SHIFT_ID` (bootstrap / resume / native start) — prevents owner-scoped duplicate ghost accepts (Gumenyuk).
- **Backend `appendSamples`**: `lastServerAcceptAt` only when `created > 0` or duplicate sampleIds exist on **current** shiftId; ghost duplicate from prior shift logs warn; telemetry-only path still updates `appLastSeenAt` / `lastGpsCapturedAt`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.153`**.
- **Mobile:** OTA or EAS build; no native Android flag change.

## [0.2.152] — 2026-08-10

### Summary

Coherent **field GPS tracking** release: idempotent sample upload, split telemetry on team API, web health badges, mobile login/recovery UX. Aligns repo with prod hotfix schema (`ownerId` nullable, `20260810133000` migration).

### Fixed

- **Backend `appendSamples`**: always sets `ownerId`; idempotent `(ownerId, deviceId, sampleId)`; response includes `duplicate`; `POST /field/shifts/:id/tracking-telemetry`.
- **Team API**: `trackingTelemetry` + deprecated `telemetry` alias; health states via `deriveTrackingTelemetry`.
- **Migration `20260810133000`**: IF NOT EXISTS columns, MOBILE backfill `appLastSeenAt` + `lastServerAcceptAt`, no `SET NOT NULL ownerId`.
- **Web `/visits/team`**: `resolveTeamTelemetry()` / health badge labels.
- **Mobile**: 3 min warmup after login (no instant «GPS не пишеться»); login refresh bootstrap + FGS recover + flush; restart shows «очікуємо точку» when FGS up but accept pending.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.152`**.
- **Prod:** migrations `20260810133000` likely already applied — deploy code only; staging: `prisma migrate deploy`.
- **Mobile:** OTA or EAS build with this commit; native Android cutover (`native_android`) **not** enabled.
- **Do not use 0.2.149–0.2.151** for field GPS without this patch — prod incident 2026-08-10 (see `docs/rfc/native-field-tracking.md`).

## [0.2.151] — 2026-08-10

### Summary

Hotfix **0.2.151**: web notification labels for planning due types (0.2.150 CI fail).

### Fixed

- **Web notifications settings**: `PLANNING_FACTORY_DUE` / `PLANNING_PACKING_DUE` labels in `NOTIFICATION_TYPE_LABELS`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.151`**.
- **Do not use 0.2.149 / 0.2.150 images** — CI failed.

## [0.2.150] — 2026-08-10

### Summary

Hotfix **0.2.150**: CI fix for 0.2.149 — `ownerId` on visit GPS dual-write.

### Fixed

- **Visit complete GPS dual-write**: include required `ownerId` on `FieldLocationSample.create` (schema 0.2.149).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.150`**.
- **Миграции:** same as **0.2.149** (if not yet deployed).
- **Do not use 0.2.149 images** — CI failed on backend build.

## [0.2.149] — 2026-08-10

### Summary

Патч **0.2.149**: native Android field tracking (opt-in); GPS sample idempotency; planning due reminders.

### Note

**0.2.149 registry images were not published** (backend tsc). Use **0.2.150+**.

### Added

- **Native field tracking**: `crm-native-tracking` Expo module (Android FGS, WorkManager flush); flag `EXPO_PUBLIC_FIELD_TRACKING_MODE=native_android`.
- **GPS idempotency**: `FieldLocationSample.sampleId` + `source` (EXPO / NATIVE_ANDROID); split presence telemetry (`appLastSeenAt`, `nativeLastSeenAt`, `trackingHealthState`).
- **Planning due reminders**: `PLANNING_FACTORY_DUE` / `PLANNING_PACKING_DUE` notifications + cron; web planning due panel.
- **Field team telemetry**: derived health for supervisors (`TeamFieldList`).

### Changed

- **Field shifts append**: owner-scoped idempotency keys; tracking telemetry on accept.
- **Web planning**: factory/packing due lists in ops panels.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.149`**.
- **Миграции:** `20260810120000_planning_due_reminder_notifications`, `20260810140000_native_field_tracking_idempotency` — **`prisma migrate deploy`** до **`up`**.
- **Mobile**: новый **EAS build** обязателен; native tracking — opt-in via env (default `legacy_expo`).
- **Web**: deploy для planning due UI + notification settings.

## [0.2.148] — 2026-08-10

### Summary

Hotfix **0.2.148**: mobile GPS health TS fixes from EAS build.

### Fixed

- **Mobile tracking health**: `no_permission` check without redundant `claimedMode` guard.
- **Shift ops gate**: `shouldOfferRestartShiftCta` uses shared `TrackingUnhealthyReason` type.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.148`** (образы без функциональных изменений backend/web).
- **Миграций нет.**
- **Mobile**: новый **EAS build** обязателен (заменяет 0.2.147 mobile).

## [0.2.147] — 2026-08-10

### Summary

Патч **0.2.147**: mobile GPS health v4 — zombie FGS, point stale, recovery state machine.

### Added

- **Field shift snapshot**: persisted ACTIVE shift DTO for cold-wake / background task append.
- **Tracking recovery state**: persisted recovery machine (`ZOMBIE_FGS`, `TASK_DEAD`, `RECOVERY_IN_PROGRESS`, etc.).
- **Zombie FGS detection**: task registered but accept/point pipeline stale; separate `pointStale` vs `acceptStale`.

### Changed

- **GPS health**: `healthKind`, `zombieFgs`, `recoveryState` in context + debug panel; GPS-stopped alert for `zombie_fgs`.
- **Background task**: shift snapshot resolve on append; last GPS point timestamps in buffer.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.147`** (образы без функциональных изменений backend/web).
- **Миграций нет.**
- **Mobile**: новый **EAS build** обязателен.

## [0.2.146] — 2026-08-10

### Summary

Патч **0.2.146**: material reservation policy; cash/bank dedup; GPS teleport reanchor + stale push; voice-gateway hardening.

### Added

- **OrderMaterialReservationService**: centralized release/consume/resync on stage change (Orders, NP TTN, Bitrix delta, returns); `reconcile:reservations` script.
- **Cash payment dedup**: unique index + ±1 min window; bank Privat24 re-import merge by `externalId`.
- **FIELD_GPS_STALE**: push when active shift GPS stale >10 min; cron every 5 min; web/mobile notification settings.
- **GPS teleport reanchor**: distant cluster reanchors prev instead of poisoning the day track.
- **Voice gateway**: host-network FreeSWITCH prep, GA Realtime 24kHz, FIFO RTP queue, idempotent media attach.

### Changed

- **Mobile GPS**: `validateRawLocationSample` in background task; deferred adaptive tier; battery-intent permission flow.
- **Web payments**: duplicate cash guard UX; payments list polish.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.146`**.
- **Миграции:** `20260807120000_payment_cash_dedup`, `20260808120000_field_gps_stale_notification` — **`prisma migrate deploy`** до **`up`**.
- **Post-deploy:** `npm run reconcile:reservations` в backend-контейнере (снять зависшие ACTIVE резервы).
- **Mobile**: новый **EAS build** обязателен.
- **Voice gateway** (если модуль включён): rebuild `gateway-service` / `sip-adapter` после pull.

## [0.2.145] — 2026-08-06

### Summary

Патч **0.2.145**: GPS `invalid_coords` vs `out_of_region` — coerce lat/lng on backend + mobile.

### Fixed

- **GPS sample filter**: NaN / non-numeric coords → `invalid_coords` (not false `out_of_region`); string coords coerced before UA bbox.
- **Field shifts append**: soft-reject bad coords with triage logging instead of 400 on whole batch.

### Changed

- **Mobile tracking**: shared `location-region-check`; `invalid_coords` as hard reject in diagnostics.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.145`**.
- **Миграций нет.**
- **Backend + mobile**: deploy / новый **EAS build** для field GPS triage.

## [0.2.144] — 2026-08-06

### Summary

Патч **0.2.144**: mobile shift ops gate (anti-thrash); web incomplete-tour copy fix.

### Added

- **Mobile shift-ops-gate**: pure gates for overlapping start/end/restart, reuse ACTIVE shift, restart-shift CTA only on `accept_stale_wrong_day`, Expo #47595 zombie FGS recreate.

### Changed

- **Mobile tracking**: force-recover background task on foreground; op-in-flight lock; clearer restart-failed hint.
- **Web route map**: `incompleteTourCopyKind` — footnote/deviation copy for open shift vs truncated track.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.144`**.
- **Миграций нет.**
- **Mobile**: новый **EAS build** обязателен.
- **Web**: deploy для route map footnotes.

## [0.2.143] — 2026-08-06

### Summary

Патч **0.2.143**: mobile GPS tracking health v3 — FGS recovery, GPS-stopped alerts, smarter battery nag.

### Added

- **Mobile GPS stopped alert**: local notification when Android background FGS dies while app minimized (`location-tracking-alerts`).
- **Battery optimization logic**: suppress battery nag when tracking is healthy with fresh accepts (`battery-optimization-logic`).

### Changed

- **Mobile tracking recovery**: `recoverDeadBackgroundTaskOnForeground` on app resume; `lastAcceptedAt` in shift context + health banner.
- **Android FGS**: `isAndroidForegroundServiceEnabled` in expo-location plugin config.
- **Debug panel**: claimed vs actual tracking mode; battery module loaded/raw API status.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.143`** (образы без функциональных изменений backend/web).
- **Миграций нет.**
- **Mobile**: новый **EAS build** обязателен.

## [0.2.142] — 2026-08-06

### Summary

Патч **0.2.142**: shift close reminder notification; mobile GPS shift bootstrap + flush schedule.

### Added

- **Field shift close reminder**: `FIELD_SHIFT_CLOSE_REMINDER` notification + cron; web notifications settings.
- **Mobile shift bootstrap**: persist shift id + Kyiv day before GPS/flush (`location-shift-bootstrap-gate`); flush schedule; GPS diagnostics format.

### Changed

- **Mobile GPS**: sample filter/reject, buffer/restart/task polish; notification channel + deep link.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.142`**.
- **Миграция:** `20260806120000_field_shift_close_reminder_notification` — **`prisma migrate deploy`** до **`up`**.
- **Mobile**: новый **EAS build** обязателен.

## [0.2.141] — 2026-08-06

### Summary

Патч **0.2.141**: GPS path integrity + loop collapse hybrid payout; Planning Today dashboard.

### Added

- **Planning Today**: `GET /planning/today` — burning items, pack/make summary, quota; web `PlanningScreens` refactor.

### Fixed

- **Path integrity**: dedupe stitch hops; omit corrupted map polyline when haversine path >> OSRM payable km (`pathDistanceMismatch`).
- **Loop collapse payout**: `gps_snap_loop_collapse` + sane `fact_visits_gps` → pay hybrid, not inflated `fact_visits`.
- **Web route map**: hide GPS/hybrid polyline on path mismatch; deviation footnotes for open shift, scheduled plan, inefficient plan order.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.141`**.
- **Миграций нет.**
- **Backend → web**, then bulk `POST /field/fuel/day/recalculate` for **July + August DRAFT** days.
- **Mobile**: новый EAS build не нужен (если field checklist OK).

## [0.2.140] — 2026-08-05

### Summary

Патч **0.2.140**: false PKG metal BOM in MRP; GPS contour OSRM-only payable km + hybrid geometry.

### Fixed

- **Planning / MRP**: metal BOM mis-imported as `PKG:*` учитываются в capacity/MRP/packing/factory — `looksLikeComponentSku` + `constrainsKitCapacity`; CAN_PACK = `min(need, maxFromParts)`; packaging UI split; repair script `repair-false-pkg-bom-parts.ts`.
- **Fuel compensation**: payable km = OSRM match/route only; loop home→…→home → `gps_snap_loop_collapse` review.
- **Hybrid geometry**: `fact_visits_gps` — visit-order legs with GPS-window OSRM match.
- **Web route map**: source labels, raw GPS off by default when not road-snapped; fuel day loop/review badges.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.140`**.
- **Миграций нет.**
- **Planning:** `repair-false-pkg-bom-parts.ts --apply`, then FULL MRP + propose packing.
- **Fuel:** backend → web → bulk `POST /field/fuel/day/recalculate` for July DRAFT days.
- **Mobile:** новый EAS build только если field checklist fails (v0.2.138+ уже с FGS fixes).

## [0.2.139] — 2026-08-05

### Summary

Патч **0.2.139**: company `region`; обязательные phone/region при создании; mobile contact/company forms.

### Added

- **Company region**: поле `region` в БД и API; миграция `20260805130000_company_region`.
- **Company create**: `phone` и `region` обязательны через API (web + mobile).
- **Mobile**: region/city в создании контакта; region в создании компании; валидация обязательных полей.

### Changed

- **Web CompanyModal**: select области при создании компании.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.139`**.
- **Миграция:** `20260805130000_company_region` — **`prisma migrate deploy`** до **`up`**.
- **Mobile**: новый EAS build рекомендуется.

## [0.2.138] — 2026-08-05

### Summary

Патч **0.2.138**: mobile GPS contour ideal pass; team GPS tiers; fuel payout copy.

### Fixed

- **Mobile GPS contour**: foreground recovery bypasses restart cooldown; adaptive tier FGS gated; sticky notification channel; `crm-battery` autolinked for release APKs; battery banner only after failed foreground restart; `fgs_start_blocked_background` unhealthy reason; More diagnostics (AppState, canStartFGS).
- **Team GPS status**: `ok` ≤10 min, `stale` 10–30 min, `none` >30 min or no samples; Team list sorts dead first + os_kill recover hint.
- **Fuel day**: clearer hard vs soft `gps_low_coverage` payout copy for managers.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.138`**.
- **Миграций нет.**
- **Mobile**: новый **EAS build** обязателен (`crm-battery` native module + AppState restart policy).

## [0.2.137] — 2026-08-05

### Summary

Патч **0.2.137**: MRP sales XLS velocity, action lists, soft reservations; planning UI refresh.

### Added

- **MRP + sales XLS**: `SalesHistoryUpload` (STAGED→POSTED→VOID), upload/post API, velocity from posted sales (not CRM orders), `safetyMonths` in horizon config, `GET planning/mrp/forecast` / `mrp/factory`, Forecast tab stage/post UI, sales freshness banners.
- **MRP action lists**: production/packaging endpoints return `ActionListItem[]` (`sku × qty × desiredDate`); UI tables with CSV export and breakdown drawer.
- **Velocity fallback**: CRM `OrderItem` when SKU missing from sales XLS; `velocitySource` on forecast/MRP details.
- **Demand rules sync**: reservation hardness follows configurable softStages; re-sync on PATCH demand-rules.

### Fixed

- **Reservations**: NEW / AWAITING_PAYMENT → SOFT (soft not subtracted from available); migration backfills existing ACTIVE rows.
- **Kit capacity**: BOM `scrapPct` in max-build ratio.
- **Horizon default**: `criticalCoverDays` 14 (was 30).
- **Safety stock**: `safetyStock=0` in params no longer blocks `avgMonthly × safetyMonths` formula.
- **Forecast source**: factory, packing, dashboard, and projection use posted-sales velocity (not legacy `KitDemandForecast` / CRM).
- **Lookback window**: stable UTC month boundaries for sales aggregation.
- **Sales coverage freshness**: warn when posted XLS spans fewer than `salesMinCoverageMonths`.
- **MRP timeliness**: composite stale banner when run is older than latest snapshot/sales; recalculate CTA after post.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.137`**.
- **Миграции:** `20260804120000_sales_history_upload` (backfill legacy `SalesHistoryLine`), `20260804180000_soft_reservation_hardness` — **`prisma migrate deploy`** до **`up`**.
- Re-post sales XLS after deploy if legacy backfill is empty (no admin user during migration).

## [0.2.136] — 2026-08-04

### Summary

Патч **0.2.136**: mobile GPS Android 12+ FGS restart policy; foreground recovery.

### Fixed

- **Mobile GPS (Android 12+)**: не вызывать `startLocationUpdatesAsync` / FGS restart в background/inactive (`skip_fgs_start_while_background`); восстановление dead background task на foreground resume + immediate fix/flush; ручной «Перезапустити трекінг» обходит cooldown и показывает реальный success/failure.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.136`** (образы без функциональных изменений backend/web).
- **Миграций нет.**
- **Mobile**: новый **EAS build** обязателен (политика AppState / FGS restart).

## [0.2.135] — 2026-08-04

### Summary

Патч **0.2.135**: mobile contact edit v2 (phones, addresses, company picker); contact card `middleName`.

### Added

- **Mobile contact edit**: полная форма — телефоны, адреса, компания, stage/status/region, owner; `ContactPhonesEditor`, `ContactAddressesEditor`, `CompanyPickerField`, `SelectField`.
- **Mobile clients list**: поиск и UX улучшения.

### Fixed

- **Contact card summary**: `middleName` в ответе API.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.135`**.
- **Миграций нет.**
- **Mobile**: новый EAS build рекомендуется.

## [0.2.134] — 2026-08-04

### Summary

Патч **0.2.134**: canceled orders zero debt + credit; unified receivables scope; mobile GPS tracking health v2.

### Fixed

- **Canceled orders**: `debtAmount=0`, `creditAmount=paid`; не попадают в receivables/contacts debt; data migration для существующих CANCELED.
- **Receivables scope**: `buildOperationalDebtOrderWhere` / `isOperationalDebtOrder` — contacts, dashboard, daily-agenda, receivables.

### Changed

- **Mobile GPS tracking**: unhealthy reason resolution, restart pipeline, immediate fix+flush; ShiftStatusCard/TrackingHealthBanner; i18n en/ru GPS strings; buffer purge.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.134`**.
- **Миграция:** `20260804150000_zero_canceled_order_debt` (data fix) — **`prisma migrate deploy`** до **`up`**.
- **Mobile**: новый EAS build рекомендуется.

## [0.2.133] — 2026-08-04

### Summary

Патч **0.2.133**: employee daily activity dashboard; MRP SKU calc refactor; mobile GPS/tracking polish.

### Added

- **Dashboard employee activity**: `GET /dashboard/employee-daily-activity` + timeline; presence, payments, orders, shipping, tasks, CRM aggregates; web **EmployeeDailyActivityPanel** + timeline drawer.
- **MRP**: `mrp-sku-calc.util` (cover metrics, net need, critical lines); planning-run quota persistence; help guide for MRP.

### Changed

- **MRP calculation**: kit-dependent gross, cover WARN/CRITICAL, PlanningOpsPanels refresh.
- **Mobile**: location reject/buffer/offline-queue tweaks; fuel day + shift status labels.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.133`**.
- **Миграций нет.**

## [0.2.132] — 2026-08-04

### Summary

Патч **0.2.132**: MRP planning runs (FULL/CRITICAL); return warehouse binding; fuel bulk recalc script.

### Added

- **MRP extension**: `PlanningProductParams`, `PlanningRun` / `PlanningRunLine`; `MrpCalculationService`, config capacity/horizon; API `POST /planning/mrp/run`; web **PlanningOpsPanels** (runs, quota, horizon).
- **Return warehouse**: `warehouseId` on `ReturnPackage` / `OrderReturn`; resolve from order or explicit pick; warehouse returns UI.
- **Script**: `bulk-recalculate-fuel-range.ts` for backfill fuel reports.

### Changed

- **Planning**: weekly job integrates MRP; BOM PART packaging filter; factory/packing tweaks.
- **Fuel / mobile**: minor compensation + tracking health polish.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.132`**.
- **Миграции:** `20260803150000_return_warehouse`, `20260804120000_mrp_extension` — **`prisma migrate deploy`** до **`up`**.

## [0.2.131] — 2026-08-03

### Summary

Патч **0.2.131**: fuel compensation GPS partial payout + planned-km sanity; risk ship gate skip TTN for pickup; fuel UI polish.

### Changed

- **Fuel compensation**: GPS partial payout (soft warnings); `assessPlannedKm` for outlier plan; richer warning codes; `estimateFuelFromKm` extracted; visit day by `completedAt`.
- **Risk ship gate**: `READY_TO_SHIP` без TTN только для **NOVA_POSHTA** (pickup не блокируется).
- **Web fuel**: warning labels, compensation vs receipt price clarity, day detail UX.
- **Mobile fuel**: aligned fuel day warnings/labels.
- **Payments**: allocate/split modals scroll on small screens.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.131`**.
- **Миграций нет.**

## [0.2.130] — 2026-07-31

### Summary

Патч **0.2.130**: mis-pick returns (пересорт) + replacement orders; GPS UA region filter & teleport reanchor; mobile session-auth on flush 401; stock upload column fix.

### Added

- **Mis-pick returns**: `ReturnReason` / `ReplacementMode` / `ReturnItemDisposition`; replacement child order; inbound/outbound checklist + waive; `ReturnModal` web; warehouse disposition UI.
- **GPS filter**: UA bounding box (`out_of_region`), teleport cluster reanchor (`sanitizeGpsTrack`); backend + mobile parity.
- **Mobile session-auth**: 401 flush blocks tracking until re-login; buffer keeps samples.
- **Help center**: expanded CRM guides seed (returns / warehouse flows).

### Changed

- **Stock upload**: one Excel column → one warehouse (no sku/name column reuse).
- **Catalog**: physical vs reserved qty tooltip per warehouse.
- **Field shifts**: append samples + fuel/route geometry alignment with new GPS filter.

### Fixed

- **Order replacement**: `OrderSource` typing (CRM/STORE only).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.130`**.
- **Миграция:** `20260731101500_order_return_mis_pick` — **`prisma migrate deploy`** до **`up`**.
- **Mobile**: новый EAS build рекомендуется (GPS filter + session-auth).

## [0.2.129] — 2026-07-30

### Summary

Патч **0.2.129**: return packages (вхідні ТТН повернень), складська черга, NP sync; store lead phone required.

### Added

- **ReturnPackage**: модель + миграция `20260730110000_return_packages`; прив'язка `OrderReturn` до пакета, `itemsPending`.
- **API `/return-packages`**: create/list/warehouse-queue/receive/add-items; ролі manager/warehouse.
- **NP cron**: sync статусів return packages (auto `RECEIVED_BY_WAREHOUSE` по NP status).
- **Web**: `/work/warehouse/returns`, `IncomingReturnPackageModal`; OrderModal — TTN + «позиції пізніше»; ReturnsKanban + sidebar.

### Changed

- **Store leads**: `phone` обов'язковий у формах/API (прибрано phone-or-email XOR).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.129`**.
- **Миграция:** `20260730110000_return_packages` — **`prisma migrate deploy`** до **`up`**.

## [0.2.128] — 2026-07-29

### Summary

Патч **0.2.128**: mobile Android Google Maps — native API key gate, lazy MapView load, static fallback.

### Fixed

- **Mobile app.config.js**: `android.config.googleMaps.apiKey` через Expo config-plugins (SDK 54 / rn-maps 1.20); флаг **`enableInteractiveGoogleMaps`** в `extra`.
- **Mobile maps-config**: `canUseInteractiveMaps()` на Android требует baked Manifest key + build-time flag.
- **DayRouteMapPanel**: lazy `require(RouteMapView)`; не монтирует MapView без native key (static preview вместо SIGABRT).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.128`** (registry; для этого патча изменений backend/web нет).
- **Mobile**: новый **native EAS build** с `GOOGLE_MAPS_API_KEY` (OTA недостаточно для интерактивной карты на Android).
- **Миграций нет.**

## [0.2.127] — 2026-07-29

### Summary

Патч **0.2.127**: public Google Maps config endpoint; web soft 401 on maps probe; mobile map routing fix.

### Fixed

- **Google Maps public config**: `GET /settings/google-maps/public` — `@Public()` (maps work before login).
- **Web api client**: 401 на `/settings/google-maps/public`, `/presence/heartbeat`, `/presence/end` не редиректит на login.
- **Mobile map routing**: убран `(tabs)/map`; `/map` → redirect `/map/[date]`; Today/More открывают dated map; `MapErrorBoundary` auto-fallback на static preview.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.127`**.
- **Миграций нет.**

## [0.2.126] — 2026-07-29

### Summary

Патч **0.2.126**: UA status labels across web — analytics, planning, outbound, visits, orders, contacts; central `status-labels.ts`.

### Added

- **`status-labels.ts`**: centralized UA labels for visit/shift/order/lead/payment/outbound/inbox enums; `StatusBadge` uses shared maps.

### Changed

- **Analytics / planning / outbound**: KPI columns, filters, campaigns, attempts — Ukrainian instead of raw enums.
- **Visits / fuel / team / history**: visit status, outcome, shift labels.
- **Orders / leads / contacts / inbox**: StatusBadge, kanban, filters, payment blocks.
- **Backend lead pipeline**: `DEFAULT_STAGE_LABELS` → Ukrainian (matches web).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.126`**.
- **Миграций нет.**

## [0.2.125] — 2026-07-28

### Summary

Патч **0.2.125**: bank matching v3 — gateway/transit IBAN guard, FIO from purpose, apostrophe-insensitive names.

### Added

- **Gateway detector**: `isSharedOrGatewayCounterparty` — транзит Privat, LiqPay, WayForPay, IBAN с ≥5 разными контактами; IBAN history и alias learn пропускаются.
- **Purpose FIO match**: `payer_name_in_purpose` — ФИО из назначения платежа матчит контакт (в т.ч. через transit).
- **Name normalization**: apostrophe-insensitive (`В'ячеслав` = `Вячеслав`); `personNameQueryVariants`, `contactMatchesPerson`.

### Changed

- **PayerAlias learn**: не привязывает клиента к shared/transit IBAN или gateway counterparty.
- **Payment matching / suggestions**: улучшенный contact lookup по ФИО; IBAN boost только для non-gateway.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.125`**.
- **Миграций нет.** Опционально после деплоя: purge gateway `PayerAlias` (см. комментарий в `payer-alias.service.ts`).

## [0.2.124] — 2026-07-28

### Summary

Патч **0.2.124**: web list scroll preserve; payments debt in payment currency; visits mobile layout; mobile visit date picker; Android Maps key guard.

### Added

- **Web `withPreservedScroll`**: списки contacts/leads/orders/payments/companies не прыгают после закрытия модалок.
- **Payments FX helper**: `debtInPaymentCurrency`, `formatDebtForAllocation` — split/allocate в валюте платежа.
- **Visits BFF/mobile**: `GET /visits/:id` proxy + `visitsApi.get`.
- **Mobile visit schedule**: календарь / today-tomorrow-custom при создании и переносе визита.
- **Mobile Maps**: `app.config.js` inject native Google Maps key; `canUseInteractiveMaps()` — не монтировать MapView без ключа на Android.

### Changed

- **Visits web**: mobile pane backlog/schedule; UA labels; responsive header и owner filter.
- **Contacts modal**: searchable company picker (`companiesApi.list`).
- **FixedDropdownPortal**: stopPropagation — nested dropdowns не закрывают parent popover.
- **Mobile maps/fuel screens**: guard when interactive maps unavailable.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.124`**.
- **Миграций нет.** Mobile EAS: задайте **`GOOGLE_MAPS_API_KEY`** / **`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`** для Android MapView.

## [0.2.123] — 2026-07-28

### Summary

Патч **0.2.123**: order PDF Cyrillic (DejaVu); invoice/waybill header in PDF; GPS keepalive samples; mobile tracking health banner.

### Added

- **Order PDF fonts**: bundled **DejaVu Sans** in Docker (`assets/fonts`); `resolveDocumentFontPaths`; invoice/waybill PDFs render Cyrillic correctly.
- **PDF header**: `documentHeaderFromOrder` — order #, invoice/waybill numbers and dates from 1C push fields.
- **GPS keepalive**: `KEEPALIVE_INTERVAL_MS` (3 min) — accept near-duplicate sample after idle (backend + mobile filter in sync).
- **Mobile `TrackingHealthBanner`**: background location + battery optimization warnings on Today tab.

### Changed

- **Visit complete GPS**: dual-write only checks accuracy, not distance dedup (visit checkpoint always recorded when accurate).
- **Mobile tracking**: adaptive config tweaks; health exposes `backgroundPermission` / `batteryOptimizationStatus`.
- **Orders web**: formatted invoice/waybill dates in modal; client column visible below xl breakpoint.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.123`**.
- **Миграций нет.**

## [0.2.122] — 2026-07-27

### Summary

Патч **0.2.122**: bank technical/ignored transactions; Risk credit gates (deferred approval, ship gate); Risk hub v2; CreditProfile XOR constraint.

### Added

- **Bank transaction classifier**: auto **`TECHNICAL`** / **`IGNORED`** для комиссий, налогов, own transfer, cash withdrawal; миграция **`20260727110000_bank_tx_ignore_technical`** — `BankIgnoreCategory`, `ignoreSource`, manual ignore/unignore API + web tab **Ignored**.
- **Risk policy gates**: deferred payment **`REQUIRE_APPROVAL`** / **`BLOCK`**; ship gate при смене стадии; approval workflow в Order modal + Risk hub.
- **Risk hub v2**: signal retention 90d, transactional recompute, exposure/policy collectors, playbooks; tests `risk-exposure`, `risk-policy`.
- **CreditProfile XOR**: миграция **`20260727160000_credit_profile_xor`** — ровно contact **или** company.

### Changed

- **Bank sync**: классификация при импорте; unmatched list excludes ignored/technical.
- **Payments web**: view **ignored**, ignore/unignore modal, category labels.
- **Orders**: deferred save требует approved risk decision; link approval to order on create.
- **RiskModule** in `AppModuleCore`; docs matrix updated.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.122`**.
- **Миграции:** `20260727110000_bank_tx_ignore_technical`, `20260727160000_credit_profile_xor`.

## [0.2.121] — 2026-07-27

### Summary

Патч **0.2.121**: hotfix CI/backend build — **`OrderStage`** typing в **`np-ttn.service.ts`**. Образы **`0.2.120`** не опубликованы (Publish Registry Release failed).

### Fixed

- **`np-ttn.service.ts`**: `persistOrderDeliveryDataWithTtn` — `orderStage` typed as **`OrderStage`**, не `string`; исправляет `tsc` в Docker build.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.121`** (вместо **`0.2.120`**).
- **Миграций нет.** Функционально идентичен **0.2.120**.

## [0.2.120] — 2026-07-24

> **Не использовать:** CI **Publish Registry Release** упал на backend `tsc` — образы в registry не собраны. Берите **`0.2.121`**.

### Summary

Патч **0.2.120**: bank auto-match по рахунку/РН (1C invoice/waybill); route plan owner guard; visits multi-owner day fixes; mobile GPS reject reasons.

### Added

- **Bank document matching**: `extractDocumentRefsFromDescription`, `resolveUniqueDocumentOrder` — auto-match и suggestions по **`invoiceNumber`** / **`waybillNumber`** заказа; приоритет invoice > waybill > unlabeled token; конфликт с orderNumber → review.
- **Match engine**: отдельные маркеры рахунок/накладна; fallback order digits не путает с 1C doc tokens.
- **Order stage guard**: выход из **NEW** требует **Код 1С** контакта — проверка в `setOrderStage` и при создании TTN (NP), нельзя обойти через накладную.
- **Web payments**: labels `invoice_match` / `waybill_match`; поиск заказов с invoice/waybill в подсказках.
- **Route plans**: `purgeForeignRouteStops`, `assertVisitsOwnedBy` — лечение и блокировка чужих визитов в плане.
- **Mobile GPS**: `location-sample-reject` — soft vs hard reject reasons в flush log.

### Changed

- **Google Sheet order-documents webhook**: пустая строка очищает поле (null); partial update; документация DTO.
- **Field fuel**: plan visit set игнорирует foreign RouteStop.
- **Visits web**: timeline/route order только визиты владельца плана; no auto-save в multi-owner day view.
- **Orders web/mobile**: invoice/waybill в модалке и wizard review.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.120`**.
- **Миграций нет.**

## [0.2.119] — 2026-07-24

### Summary

Патч **0.2.119**: bank auto-match v2 (payer aliases, suggestions, audit); стадия **`FULLY_RETURNED`**; return coverage PARTIAL/FULL.

### Added

- **Order returns**: стадия **`FULLY_RETURNED`** — миграция **`20260724140000_order_stage_fully_returned`**; `computeReturnCoverage`; kanban/UI/mobile labels.
- **Bank matching v2**: миграция **`20260724150000_payer_alias_and_match_audit`** — `PayerAlias`, `PaymentMatchAudit`, `PARTIALLY_MATCHED`; `MatchSuggestionService`, payer-alias learn/audit; API match-suggestions + auto-match.
- **Web payments**: UI подтверждения suggestions; BFF payer-aliases / match-suggestions.

### Changed

- **Match engine**: IBAN/history/name scoring; split allocation rounding; Сидоренко-style auto-match among open orders.
- **Order pipeline**: `FULLY_RETURNED` в defaults/settings.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.119`**.
- **Миграции:** `20260724140000_order_stage_fully_returned`, `20260724150000_payer_alias_and_match_audit`.

## [0.2.118] — 2026-07-24

### Summary

Патч **0.2.118**: Kyivstar FMC fixes (`calls` lowercase, Kyiv midnight hour 24); mobile base currency + UAH hint; field shifts BFF routes.

### Fixed

- **Kyivstar FMC**: `parseKyivstarCallHistoryPayload` принимает live **`calls`** (не только `Calls`); `formatKyivstarFmcQueryDatetime` — `hourCycle: h23`, без hour **24** у Kyiv midnight; ingest использует общий parser.

### Added

- **Mobile orders**: `useBaseCurrency` из settings; `formatOrderAmount` / `formatBaseMoney`; UAH в скобках для USD/EUR.
- **Web field BFF**: **`POST /api/field/shifts/start`**, **`…/end`**, **`…/tracking-events`**, **`POST …/samples`**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.118`**.
- **Новых миграций нет.**

## [0.2.117] — 2026-07-23

### Summary

Патч **0.2.117**: **Help** (instruction center + seeded guides) и **Risk Management** (ERI scorecard, hub, cron); receivables debt comments; payments search polish.

### Added

- **Help center**: миграции **`20260723120000_help_instruction_center`**, **`20260723130000_help_article_seed_revision`** — categories/articles/bindings, seed CRM guides + manager playbook; web **`/help`**, editor, route hints.
- **Risk Management** (`ext.risk_management`): миграция **`20260723140000_risk_management_module`** — credit profiles, signals, score snapshots, ERI, playbooks; API **`/risk/*`**; web hub + **DashboardRiskPanel**; nightly cron.
- **Receivables**: debt comments на contact (`GET/POST …/comments`), **DebtCommentDialog**, dashboard/manager panels.

### Changed

- **Payments search**: amount/phone/bank fields; receivables scope/constants; **OrderModal** debt UX.
- **AppModuleCore**: Help, Risk, Receivables in-process modules.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.117`**.
- **Миграции:** `prisma migrate deploy` / **`backend-migrate`** — **`20260723120000_help_instruction_center`**, **`20260723130000_help_article_seed_revision`**, **`20260723140000_risk_management_module`**.

## [0.2.116] — 2026-07-22

### Summary

Патч **0.2.116**: anti-inflation GPS fuel (long vs visits + snap fix); pickup auto-ship cron; receivables debt from READY_TO_SHIP+; dashboard receivables panel.

### Added

- **Pickup auto-ship**: nightly cron — `PICKUP` + `READY_TO_SHIP` → `SHIPPED`.
- **Dashboard receivables**: **DashboardReceivablesPanel** (1C vs CRM reconcile snapshot).
- **Ops script**: `recalculate-inflated-gps-fuel-drafts.ts` для пересчёта завышенных GPS fuel drafts.

### Fixed

- **GPS snap**: fallback только start→end (не все jitter waypoints); distance = sum chunk km, не длина dense polyline.
- **Fuel eligibility**: `gps_implausibly_long_vs_visits` (`TRACK_VS_VISITS_MAX_RATIO` 1.35) — inflated track → payout by visits.

### Changed

- **Receivables**: debt только со стадий **`READY_TO_SHIP`** и дальше (не ранняя воронка).
- **OrderModal** / kanban polish; fuel warning для long-vs-visits.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.116`**.
- **Новых миграций нет.**

## [0.2.115] — 2026-07-21

### Summary

Патч **0.2.115**: GPS track snap по time-gap + stitch OSRM; dashboard leadership tabs/hero KPIs; mobile API URL probe; Bearer auth для native; web i18n/UX polish.

### Added

- **GPS track snap**: `gps-track-snap.util` — split samples по 30 min gap, stitch straight gaps через OSRM route legs; segment-aware `/match`.
- **Dashboard leadership**: tabs Today / Team / Sales, **DashboardHeroKpis**, **DashboardQualityFlags**, **DashboardTabBar**.
- **Mobile auth/API**: BFF **`GET /api/system/version`**; login возвращает `token`/`user`; `/auth/me` принимает **Bearer**; `resolveApiBaseUrl` с fallback `/api`.

### Changed

- **Field shifts**: sort GPS samples on append; Kyiv day для shift date; time-aware road snap.
- **Web**: i18n dashboard/visits/contacts; proxy tweaks; route map layer labels; timeline polish.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.115`**.
- **Новых миграций нет.**

## [0.2.114] — 2026-07-20

### Summary

Патч **0.2.114**: перенос переплаты между заказами (`creditAmount` / `transfer-credit`); один ACTIVE field shift на день; рефактор карточки контакта; mobile runtime API URL; GPS/route polish.

### Added

- **Order credit transfer**: миграция **`20260720120000_order_credit_amount_transfer`** — `Order.creditAmount`, `PaymentSourceType.CREDIT_TRANSFER`, `transferGroupId` / `linkedOrderId`; API **`POST /payments/transfer-credit`**; UI в **OrderPaymentBlock** / payments.
- **Contact card**: вкладки Profile / Activity / Finance / Delivery / Analytics / Work; shell header; visit planner.
- **Mobile**: экран **server-setup**, runtime API URL (`api-url` / SecureStore), EAS/config updates.

### Changed

- **Field shifts**: миграция **`20260720100000_field_shift_one_active_per_day`** — unique ACTIVE `(ownerId, date)`; закрытие дублей.
- **GPS tracking**: dual-write по Kyiv day визита; filter/eligibility tweaks; route map arrows / dashed fallback.
- **Cash payments**: менеджер может править сумму/валюту своего cash-платежа.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.114`**.
- **Миграции:** `prisma migrate deploy` / **`backend-migrate`** — **`20260720100000_field_shift_one_active_per_day`**, **`20260720120000_order_credit_amount_transfer`**.

## [0.2.113] — 2026-07-17

### Summary

Патч **0.2.113**: OSRM **`/match`** суммирует все сегменты (не только `matchings[0]`); sanity-check GPS vs visits для топлива; nginx upload limit **50M** + понятные ошибки **413** в planning.

### Fixed

- **OSRM match**: `parseOsrmMatchResponse` суммирует distance/duration и склеивает geometry по всем `matchings` (gaps → несколько сегментов; раньше занижало км).
- **Fuel eligibility**: `gps_implausibly_short_vs_visits` (`TRACK_VS_VISITS_SANITY_RATIO` 0.35) — при здоровом coverage, но слишком коротком snapped GPS относительно маршрута по визитам, выплата по visits.
- **Planning uploads**: сообщения при nginx **413**; i18n hint про `client_max_body_size`.

### Changed

- **Deploy nginx**: `client_max_body_size` **50M** (CRM/API/store) + README про HTTPS-блок certbot.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.113`**.
- **Новых миграций нет.**
- На сервере: в nginx (и **:443**) для `crm`/`api` — **`client_max_body_size 50M;`**, затем `nginx -t && reload`. См. **`deploy/nginx/README.md`**.

## [0.2.112] — 2026-07-17

### Summary

Патч **0.2.112**: записи звонков на карточках сущностей; dual-write GPS при завершении визита в ACTIVE shift track; OSRM **`/match`** для GPS-треков; жёстче eligibility топлива (coverage / early end); правки BOM import.

### Added

- **Calls history**: фильтры `contactId` / `leadId` / `companyId`; web **`EntityCallRecordingsPanel`** в Contact / Lead / Company.
- **Visit complete → GPS**: `visit-complete-gps-track` — sample в ACTIVE tracking shift при complete.
- **OSRM match**: `matchTrack` / `parseOsrmMatchResponse` для сглаживания GPS-трейсов.

### Changed

- **Fuel track eligibility**: `MIN_TRACK_COVERAGE_RATIO` (0.7), `TRACK_END_GRACE_MIN` (45) — отклонение низкого покрытия / обрезанных треков.
- **BOM import**: уточнения + скрипт `run-suprex-bom-import.ts`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.112`**.
- **Новых миграций нет.**

## [0.2.111] — 2026-07-16

### Summary

Патч **0.2.111**: **BOM import** создаёт/связывает **PART** (упаковка/комплектующие вне витрины); каталог продаж не смешивается с PART; UI planning показывает созданные parts.

### Added

- **`bom-part.util`**: SKU для packaging (`PKG:…`), article parts, uniquify; auto-create PART на miss при import.
- **Products**: `listParts` API; catalog list excludes `kind=PART`; entity/API `kind` на list items.
- **Planning web**: отображение `createdPartCount` / `createdParts` после BOM import.

### Changed

- **BOM import**: kits из sales catalog (Bitrix-style SKU); components — только PART/OTHER, не sellable KIT.
- **Product store** selects/queryRaw — поле `kind` для list types.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.111`**.
- **Новых миграций нет.**

## [0.2.110] — 2026-07-16

### Summary

Патч **0.2.110**: **OSRM в SUPREX compose** — сервис `osrm` + `OSRM_BASE_URL` в `compose.client.yml` (раньше был только в `docker-compose.prod.yml`, поэтому на клиентах оставался haversine).

### Fixed

- **Deploy**: `compose.client.yml` — сервис **`osrm`**, bind **`OSRM_DATA_HOST`** (default `/opt/crm/osrm-data`), env backend **`OSRM_BASE_URL=http://osrm:5000`**, **`ROUTING_PROFILE=car`**.
- **OsrmRoutingService**: default base URL `http://osrm:5000` (не `127.0.0.1`) для Docker-сети.
- **Docs**: `deploy/osrm/README.md` — инструкция для SUPREX / install bundle.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.110`**.
- **Новых миграций нет.**
- На сервере: положить граф UA в **`/opt/crm/osrm-data/`** (`ukraine.osrm*`), sync compose, `up -d osrm` (+ restart backend). См. **`deploy/osrm/README.md`**. Без графа контейнер OSRM будет рестартиться; маршруты останутся fallback до появления данных.

## [0.2.109] — 2026-07-16

### Summary

Hotfix **0.2.109**: catch-all BFF **`/api/planning/[...path]`** — factory / packing / forecast / dashboard / settings из web доходят до backend.

### Fixed

- **Planning web**: в **0.2.108** не хватало catch-all proxy; dedicated routes покрывали только inventory/boms/queues/batches. Добавлен **`apps/web/src/app/api/planning/[...path]/route.ts`** (GET/POST/PATCH/PUT/DELETE).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.109`**.
- **Новых миграций нет.**

## [0.2.108] — 2026-07-16

### Summary

Патч **0.2.108**: **production planning** (packing lists, factory orders, forecast, 1C sales/inventory), **OSRM** вместо Google Routes для км/полилиний, сверка дебіторки (Bitrix legacy debt = 0), mobile visit UX, звук уведомлений.

### Added

- **Planning pack/factory**: миграция **`20260715160000_planning_pack_factory`** — `KitDemandForecast`, `SalesHistoryLine`, `PackingList`/`PackingListLine`, `FactoryOrder`/`FactoryOrderLine`; сервисы forecast, packing-list, factory-order, planning-settings; demand-mix / BOM / snapshot freshness utils; web **`PlanningOpsPanels`** на `/planning`.
- **OSRM routing**: модуль `apps/backend/src/routing` (`OsrmRoutingService`, cache); `deploy/osrm/` + `docker-compose.prod.yml` service `osrm`; env `OSRM_BASE_URL` / `ROUTING_PROFILE`; source геометрії **`osrm`** (замість google).
- **Receivables**: вкладка дебіторки в **ContactModal** (`ContactReceivablesTab`); миграция **`20260713140000_zero_bitrix_legacy_debt`** — обнулення фантомного боргу на закритих Bitrix-угодах.
- **Web**: `notification-sound.ts` + NotificationBell; route `traffic` query на geometry bundle.
- **Mobile**: `VisitEntityPickerPanel`, покращення visit location / reschedule / geofence / login.

### Changed

- **Route geometry** — backend/web типи джерела: `osrm` | `fallback` | `raw_gps` | `none`.
- **Receivables** parser/scope/constants — уточнення звірки з CRM.
- **Store checkout**, companies, orders, tasks, analytics scope — супутні правки.

### Fixed

- **Web CI**: `RouteOwnerOpts.traffic`; `routeSourceLabel` без застарілого `"google"`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.108`**.
- **Миграции** (до `up`): **`20260713140000_zero_bitrix_legacy_debt`**, **`20260715160000_planning_pack_factory`**.
- **OSRM** (опційно для точних км): зібрати граф UA (`deploy/osrm/README.md`), volume `osrm_data`, `OSRM_BASE_URL=http://osrm:5000`. Без OSRM маршрути падають у fallback.

## [0.2.107] — 2026-07-13

### Summary

Патч **0.2.107**: **дебіторка** (receivables snapshots из 1C Excel + сверка с CRM), **Expo push** на mobile, **кастомная локация визита** (Google Places), UX вложенных модалок.

### Added

- **Receivables**: `ReceivablesSnapshot` / `ReceivablesSnapshotLine`, миграция **`20260711120000_receivables_snapshots`**; загрузка Excel из 1C, reconcile с долгом CRM по `externalCode`; API **`/receivables`** (snapshots, lines, upload, overdue); web **`/receivables`**, proxy `/api/receivables/*`; модуль Finance.
- **Expo push**: `UserPushDevice`, канал **`mobile`** в `UserNotificationPreference` (миграция **`20260711140000_add_push_devices`**); `ExpoPushService`, `POST/DELETE /notifications/push-devices`; mobile `push-notifications-context`, deep-link navigation.
- **Visit location**: `VisitLocationPicker` (web, Google Places), `VisitLocationSection` / `VisitLocationSheet` (mobile); сохранение GEOCODED-локации при переносе визита; geofence watcher updates.
- **Modal UX**: `scheduleModalClose` — защита от click-through при закрытии вложенных модалок; `EntityModalShell` `zIndex`; docs **`UX-MODALS.md`**.

### Changed

- **Notifications** delivery — mobile push channel; settings page mobile toggle.
- **Web modals** — leads/contacts/companies/orders/TTN/FX write-off: единый shell и ESC/overlay behavior.
- **Visits** — create/edit с выбором места встречи; fuel receipt image compress.
- **Sidebar** — пункт «Дебіторка»; nginx proxy notes.

### Fixed

- **Receivables** — `todayYmdKyiv()` вместо несуществующего `kyivTodayYmd` (backend build).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.107`**.
- **Миграции** (до `up`): **`20260711120000_receivables_snapshots`**, **`20260711140000_add_push_devices`**.
- Mobile push: собрать новый Expo build с push permissions; зарегистрировать device через API после логина.

## [0.2.106] — 2026-07-08

### Summary

Патч **0.2.106**: **fuel compensation v2** — выплата по GPS-треку при eligibility (≥ 2 сэмпла, ≥ 0.5 км), иначе маршрут по визитам; ужесточённый GPS-фильтр; snapshot `trackKm` / `visitRouteKm`; mobile flush/offline UX.

### Added

- **Track compensation eligibility**: `isTrackEligibleForCompensation` (`MIN_TRACK_COMPENSATION_KM=0.5`, `MIN_TRACK_COMPENSATION_SAMPLES=2`); `compensationFactKind` в geometry bundle / fuel snapshot.
- **Fuel snapshot**: `trackKm`, `visitRouteKm`, `trackMetricsSource` (`track` / `track_fallback` / `none`); warnings `gps_track_too_short` / `gps_track_ineligible`.
- **Docs**: API notes — batch samples (250), track-geometry, fuel recalculate priority GPS → visits.

### Changed

- **GPS sample filter**: accuracy ≤ 150 м (как visit GPS), дедуп по дистанции 15 м, анти-glitch 150 км/ч (sync mobile/backend).
- **Fuel recalculate**: приоритет GPS-трек → маршрут по завершённым визитам → `none`.
- **Mobile**: location flush/offline-queue errors, fuel day UI; web fuel page labels.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.106`**.
- **Новых миграций нет.**

## [0.2.105] — 2026-07-06

### Summary

Патч **0.2.105**: автоматическая **очередь пропущенных звонков** (Ringostat/Kyivstar FMC), корректные **NP payer/payment** при создании ТТН, infinite scroll на **payments**, badge активных лидов в sidebar.

### Added

- **Missed call queue**: `CallQueueItem.callId` (уникальный FK на `Call`), миграция **`20260706143000_call_queue_item_missed_call`**; `MissedCallQueueService` — enqueue при inbound MISSED, auto-cancel при ответе; интеграция в **Ringostat** и **Kyivstar FMC** ingest; `isConversation()` util; backfill-скрипт **`backfill-missed-call-queue.ts`**; env **`MISSED_CALL_QUEUE_DISABLED`**.
- **NP financial mapping**: `np-financial.util.ts` — `resolveNpFinancialFields` (payerType/paymentMethod из DTO, заказа, settings); используется в `np-ttn.service`.
- **Web**: `InfiniteScrollSentinel` — подгрузка на странице payments; `useActiveLeadsCount` — badge в **Sidebar**; улучшения **work/calls** queue UI.
- **Mobile**: обновления **CallsQueuePanel** / **CallQueueRow**.

### Changed

- **Ringostat / Kyivstar FMC ingest** — пропущенные звонки попадают в call queue вместо дублирующих задач (где применимо).
- **Manual calling** — resolve queue item при разговоре с контактом/лидом.
- **Payments** — offset/limit list API для infinite scroll.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.105`**.
- **Миграция:** **`20260706143000_call_queue_item_missed_call`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.
- Опционально: backfill очереди — `npx ts-node scripts/backfill-missed-call-queue.ts --days=14` (из `apps/backend`).

## [0.2.104] — 2026-07-06

### Summary

Патч **0.2.104**: **заправки с чеками** (fuel refuels), единые **attention-фильтры** для dashboard/analytics/списков, рефакторинг **daily agenda** (suggestion keys, summary strip, drill-down ссылки), mobile fuel refuels.

### Added

- **Fuel refuels**: `FuelRefuelEntry` + миграция **`20260706120000_fuel_refuel_entries`**; API **`GET/POST/DELETE /field/fuel/refuels`**, **`GET …/receipt`**; хранение чеков (`FUEL_RECEIPTS_DIR`, volume `fuel_receipts` в `compose.client.yml`); web **`FuelRefuelPanel`** на `/visits/fuel`; mobile экраны fuel + `fuel-refuels.ts`.
- **Attention filters**: общие пресеты для tasks (`attention=overdue`), orders (`overdue-payments`, `stuck`), leads (`without-touch`, `never-contacted-new`, `stale-in-progress`); утилиты `*-attention.util.ts`; синхронизация dashboard tiles, analytics attention и list API; docs **`docs/attention-filters.md`**.
- **Daily agenda**: `suggestion-keys`, `suggestion-mapper`, `helpers`; web **`AgendaItemCard`**, **`AgendaSuggestionGroup`**, **`AgendaSummaryStrip`**, `agendaKindConfig` / `agendaSummaryLinks` — summary strip и кликабельные ссылки на списки.
- **List drill-down**: `?ids=` на tasks/orders; `?attention=` query на leads/tasks/orders pages.

### Changed

- **Analytics attention** — использует те же пресеты, что и списки.
- **Daily agenda** service/completion/proposal — стабильные suggestion keys, меньше дублей.
- **Manager inbox / dashboard attention** — ссылки на attention-фильтры.
- **Visits** team map / route layers — мелкие правки.
- **Leads** — `suggest-contact` proxy, LeadModal/LeadCard.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.104`**.
- **Миграция:** **`20260706120000_fuel_refuel_entries`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.
- Опционально: **`FUEL_RECEIPTS_DIR`** / volume **`fuel_receipts`** для фото чеков (см. `.env.base.example`, `compose.client.yml`).

## [0.2.103] — 2026-07-03

### Summary

Патч **0.2.103**: **Manager dashboard** (inbox рабочей очереди + scorecard), надёжный **Telegram inbound** (идемпотентная обработка, статусы сообщений, назначение чата, webhook self-service), поиск на **payments/bank**, событие **CONVERTED** в истории лида.

### Added

- **Manager dashboard**: `GET /dashboard/manager-inbox` и `GET /dashboard/manager-scorecard` — рабочая очередь (лиды без касания, просроченные задачи/оплаты, долговой контроль), pipeline counts, hot leads, activity/outcome метрики с compare-периодом; `ManagerDashboardService`, web `components/dashboard/manager/*`, proxy `/api/dashboard/manager-inbox`, `/api/dashboard/manager-scorecard`.
- **Telegram**: идемпотентная обработка inbound (`TelegramInboundUpdate.processedAt`/`processingError`, миграция **`20260703120000_telegram_inbound_processed_at`**); статус доставки сообщения (`Message.status`: `PENDING`/`SENT`/`FAILED`, миграция **`20260703121000_message_status_outbox`**); назначение чата менеджеру — `POST /conversations/:id/assign` + proxy `/api/conversations/[id]/assign`; self-service webhook — `/api/settings/telegram/register-webhook`, `/webhook-info`.
- **Payments/Bank**: поиск по номеру заказа, имени/телефону клиента, описанию/контрагенту транзакции и примечанию (`payment-search.util.ts`); фильтр на страницах payments и bank transactions.
- **Leads**: событие **`CONVERTED`** в `LeadEventType` (миграция **`20260703140000_lead_event_converted`**) для трассировки конвертации.
- **Module gating**: декоратор **`@SkipModuleGating()`** — публичные webhook-и всегда отвечают ack.
- **Orders**: ручная строка заказа (non-product line) с пересчётом суммы.

### Changed

- **Telegram conversations** — модель назначения (`assignedUserId`), контроллер/сервис; inbox web UI.
- **Dashboard** page/module — подключение manager-секций.
- **Bank transactions / payments** — DTO списков с `search`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.103`**.
- **Миграции** (до `up`, `prisma migrate deploy` / **`backend-migrate`**): **`20260703120000_telegram_inbound_processed_at`**, **`20260703121000_message_status_outbox`**, **`20260703140000_lead_event_converted`**.

## [0.2.102] — 2026-05-20

### Summary

Патч **0.2.102**: телеметрия **перезапусков GPS-трекинга** (field shifts), безопасное **сопоставление банковских платежей**, корректный **payment status** с FX write-off и возвратами, mobile watchdog и UX заказов/доставки.

### Added

- **Field tracking events**: `FieldTrackingEvent`, enum `TRACKING_TASK_RESTARTED` и причины (`OS_KILL`, `TIER_CHANGE`, `APPSTATE`, `WATCHDOG`); миграция **`20260702120000_field_tracking_events`**; API **`POST /field/shifts/:id/tracking-events`**; team view — счётчик и причина последнего рестарта.
- **Bank allocation**: advisory lock + `FOR UPDATE` при разнесении платежей; утилиты `bank-allocation.util.ts`, тесты.
- **Mobile**: watchdog перезапуска трекинга, telemetry (`tracking-telemetry.ts`), battery optimization prompt, shipping profile summary/picker, улучшения order wizard.

### Changed

- **Orders / payments**: `computePaymentStatus` учитывает `fxWriteOffAmount` и `returnAdjustmentAmount`; web **OrderPaymentBlock** — отображение FX write-off в оплате.
- **Team field list**: бейджи рестартов трекинга (web).
- **Mobile**: adaptive location tracking, restart reason logging, order save flow.

### Fixed

- **Orders**: `mapToEntity` — корректное приведение сумм для `computePaymentStatus`.
- **TeamFieldList**: синтаксис `restartReasonLabel` (web build).
- **OrderModal**: убран лишний prop у `OrderClientBalancePanel` (debt уже с учётом FX).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.102`**.
- **Миграция:** **`20260702120000_field_tracking_events`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.

## [0.2.101] — 2026-05-20

### Summary

Патч **0.2.101**: **Meta Messaging** (Instagram Direct / Facebook Messenger) в инбоксе, маршрут за день на **visit history**, unread badges для Meta.

### Added

- **Meta Messaging** (`int.integrations_meta_messaging`): webhook `/integrations/meta/webhook`, `MetaParticipant`, миграция **`20260701120000_add_meta_messaging_inbox`**; каналы **INSTAGRAM** / **FACEBOOK**; API **`/meta-conversations`**; Settings → **Meta Messaging**; web **`/inbox/instagram`**, **`/inbox/facebook`**; уведомления **`META_*_MESSAGE`**.
- **Docs**: **`docs/META-MESSAGING.md`** — настройка Meta App и CRM.
- **Visits history**: inline **`DayRouteMapPanel`** и **`DayRouteMapDialog`** — маршрут за выбранный день.

### Changed

- **Conversation** model — `metaParticipantId`, optional `telegramChatId`; **Message** — `externalMessageId`.
- **Telegram conversations** — общая модель с Meta; unread-count расширен.
- **Inbox layout**, **Sidebar** — Meta unread badges (`useMetaInboxUnread`).
- **Notifications** settings — Meta message types.

### Fixed

- **Visits history** — TypeScript narrow для `mapDateKey` (web CI).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.101`**.
- **Миграция:** **`20260701120000_add_meta_messaging_inbox`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.
- Meta: см. **`docs/META-MESSAGING.md`** (webhook URL, Page token, module license).

## [0.2.100] — 2026-05-20

### Summary

Патч **0.2.100**: badge непрочитанных **Telegram inbox**, UX заказов (клиент/1C code), фикс **EmployeeModal** route fields.

### Added

- **Telegram inbox**: `GET /conversations/unread-count` — OPEN чаты с последним inbound-сообщением; badge в **Sidebar** (`useInboxUnread`).

### Changed

- **Orders**: kanban/list — `contact.externalCode` в ответе; **OrderModal** — клиент первым, отображение 1C-кода.
- **EmployeeModal**: стабильная загрузка route start/end (ref-based reset, без stale closure).
- **Warehouse** work page — мелкие правки.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.100`**.
- **Новых миграций нет.**

## [0.2.99] — 2026-05-20

### Summary

Патч **0.2.99**: **Dashboard v2** (executive KPIs, team pulse, quality, attention), редактирование **resultNote** завершённого визита, mobile **перенос визита**.

### Added

- **Dashboard v2**: `GET /dashboard/v2` — KPIs, sales charts, team pulse, managers table, quality panel, attention, my work (day plan + daily agenda); web компоненты в **`components/dashboard/`**, proxy **`/api/dashboard/v2`**.
- **Analytics quality**: `AnalyticsQualityService` — визиты без resultNote, GPS verified, day plan trend, overdue follow-ups.
- **Visits**: PATCH **`resultNote`** на DONE-визитах + синк timeline activity.
- **Mobile**: **`VisitRescheduleSheet`** — перенос визита с календарём.

### Changed

- **Dashboard** page — рефакторинг на v2 API и модульные секции.
- **Analytics scope** — `resolveDashboardScope` для MANAGER/ADMIN/LEAD.
- **Analytics visits** — фильтр по `startsAt` или `completedAt`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.99`**.
- **Новых миграций нет.**

## [0.2.98] — 2026-05-20

### Summary

Патч **0.2.98**: авто-закрытие «зависших» field shifts, mobile day-route map (`/map/[date]`), история визитов по дням, Samsung GPS guide.

### Added

- **Field shifts**: `closeStaleActiveShifts` — закрытие ACTIVE-смен с датой &lt; сегодня (Kyiv); cron **`00:05`** Europe/Kyiv (`FieldShiftsCron`); при `getActive` — авто-cleanup для пользователя.
- **Mobile map**: **`DayRouteMapPanel`**, экран **`/map/[date]`** (planned / fact_visits / fact_gps layers).
- **Mobile visits history**: группировка по дням/владельцу — **`visit-history.ts`**.
- **Docs**: **`docs/mobile-samsung-settings-uk.pdf`** / `.html` — настройки Samsung для фонового GPS.

### Changed

- **Mobile** tab map — рефакторинг на shared panel; today screen, visit detail, shift tracking context.
- **`route-map.ts`**: static map URL, geometry bundle helpers.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.98`**.
- **Новых миграций нет.**
- Cron (опционально): `CRON_ENABLED=true` для nightly close stale shifts.

## [0.2.97] — 2026-05-20

### Summary

Патч **0.2.97**: качество GPS-трека для fuel compensation (partial coverage), надёжный restart background tracking на mobile, доработки snap-to-roads и карты команды.

### Added

- **`assessGpsTrackQuality`**: различие **partial coverage** (много точек, низкий coverage ratio) vs **degraded** (мало точек).
- **Mobile**: `ensureBackgroundTaskRunning` — перезапуск мёртвого background task; тест **`location-tracking-restart.spec.ts`**.

### Changed

- **Fuel**: плотный GPS-трек (≥50 точек) считается `fact_gps` даже при низком coverage; warning **`gps_partial_coverage`**.
- **Route plans**: логирование snap-to-roads, fallback при отсутствии API key.
- **Mobile**: `resumeTrackingIfNeeded`, `ensureTrackingContinuity`, `maintainBackgroundTracking`.
- **Web `/visits/team`**: **`TeamFieldMap`** i18n и UX.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.97`**.
- **Новых миграций нет.**

## [0.2.96] — 2026-05-20

### Summary

Патч **0.2.96**: уведомления о **Telegram inbox**, **ad-hoc визит** с поля, маршрутизация multi-leg на карте визитов, **NP COD** в ТТН, рефакторинг **tasks** и i18n analytics.

### Added

- **Telegram inbox notifications**: `NotificationType.TELEGRAM_MESSAGE`, миграция **`20260630120000_add_telegram_message_notification`**, **`TelegramInboxNotifierService`**.
- **Ad-hoc visit**: `POST /visits/log-ad-hoc` — визит без плана (контакт по телефону, outcome, GPS); web **`LogAdHocVisitModal`**, mobile **`LogAdHocVisitSheet`**.
- **Route routing**: `route-routing.util` — concat/downsample multi-leg paths для **`VisitsRouteMap`**.
- **NP TTN COD**: defaults по заказу (`debtAmount`), feature flag, валидация суммы НП.
- **Web tasks**: расширенный список (фильтры, сортировка, i18n), **`task-labels`**, users/rbac API resources.
- **Mobile**: task form components, ad-hoc visit, NP API.

### Changed

- **Analytics** pages — i18n (en/uk).
- **Notifications** service, **NotificationBell**, settings/notifications.
- **Users** API, **EmployeeModal**, **ContactModal**.
- **Visits** map layers, **TtnModal** COD UX.

### Fixed

- **TtnModal**: locale keys под `orders.modal.*`.
- **Tasks page**: `Suspense` для `useSearchParams` (web CI).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.96`**.
- **Миграция:** **`20260630120000_add_telegram_message_notification`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.

## [0.2.95] — 2026-05-20

### Summary

Патч **0.2.95**: надёжность **mobile field tracking** (health check, auto-restart), раздельные статусы heartbeat/GPS на карте команды, payment link с mobile, фильтр командных визитов.

### Added

- **Mobile tracking health**: `reconcileTrackingHealth`, предупреждения на Shift card при мёртвом background task, `resumeTrackingIfNeeded`.
- **Mobile orders**: **`CreatePaymentLinkSheet`** — публичная ссылка на оплату из карточки заказа.
- **Mobile visits**: фильтр командных визитов (`TeamVisitFilter`, `use-team-visit-filter`).
- **Docs**: **`docs/mobile-field-tracking-qa.md`** — чеклист QA перед mobile-релизом.

### Changed

- **Presence thresholds**: online **180s**, GPS stale **20 min**.
- **Web `/visits/team`**: отдельные бейджи heartbeat vs GPS («Немає heartbeat» при живом GPS).
- **Backend field shifts**: логирование причин отклонения GPS-сэмплов.
- **Mobile**: улучшенный presence heartbeat, location buffer/permissions, today screen, visit schedule.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.95`**.
- **Новых миграций нет.**

## [0.2.94] — 2026-05-20

### Summary

Патч **0.2.94**: **presence / monitoring** (сессии активности web+mobile), фильтрация GPS-трека, статусы полевой команды, доработки fuel, крупный mobile UI refresh, companies/visit geofence.

### Added

- **Presence**: `UserActivitySession`, миграции **`20260626120000_user_activity_session`**, **`20260629120000_user_activity_session_app_state`**; API **`POST /presence/heartbeat`**, **`GET /presence/overview`**; web **`/monitoring`**.
- **GPS filter**: `filterGpsSample` / `filterGpsTrack` (backend + mobile) — отсев телепортов и дублей.
- **Field team status**: GPS stale/ok/none + app presence (`ACTIVE`/`BACKGROUND`) на карте команды.
- **Mobile**: design system (AppButton, Screen, BottomSheet, …), companies, visit geofence, presence heartbeat, adaptive location tracking, visit schedule.
- **Web**: API proxy presence, **`/products/stock/create-missing`**, fuel/visits team UX.

### Changed

- **Field fuel**: пересчёт и approval flow.
- **Orders**: видимость store-pool через **`STORE_OWNER_ID`** (не все store-заказы).
- **Products**: stock upload / SKU normalizer.
- **Payments**, **catalog**, sidebar nav.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.94`**.
- **Миграции:** **`20260626120000_user_activity_session`**, **`20260629120000_user_activity_session_app_state`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.

## [0.2.93] — 2026-05-20

### Summary

Патч **0.2.93**: геометрия трека смены по дорогам, фикс календаря визитов (Kyiv TZ), видимость лидов для **MANAGER**, поиск контактов по коду **`/…`**, доработки NP city matching, mobile work hub (звонки, каталог, карта).

### Added

- **Field shifts**: **`GET /field/shifts/:id/track-geometry`** — snap GPS-трека к дорогам (Google Roads / fallback); web **`/visits/team`** рисует маршрут по дорогам.
- **Leads**: видимость для **MANAGER** (owned, website, managed contacts) — **`leads-manager-visibility.spec.ts`**.
- **Contacts**: поиск по **`externalCode`** через префикс **`/`** (например `/00.100`).
- **Visits**: day-query в часовом поясе **Europe/Kyiv** — **`visits-day-kyiv.spec.ts`**.
- **Mobile**: вкладка **Work**, звонки, каталог, карта маршрута, active-work banner, редактирование контакта.

### Changed

- **NP sync**: улучшенный матчинг названий населённых пунктов из description.
- **Products**: нормализация артикулов / SKU в stock upload.
- **Web**: **OrderModal**, **TeamFieldMap**, **NpDirectorySelects**, visits pages.
- **Dashboard**: мелкие правки.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.93`**.
- **Новых миграций нет.**

## [0.2.92] — 2026-05-20

### Summary

Патч **0.2.92**: дедупликация задач на пропущенные звонки (**`Task.callId`**), склады **Киев / Луцьк / Хмельницький**, улучшения загрузки остатков из Excel, видимость заказов для **MANAGER**, доработки каталога и задач.

### Added

- **`Task.callId`**: уникальный FK на **`Call`**; миграция **`20260624143000_task_call_id`**; Ringostat / Kyivstar FMC ingest создают задачу с привязкой к звонку.
- **Склады**: **Киев**, **Луцьк**, **Хмельницький** — миграция **`20260625120000_add_kyiv_lutsk_khmelnitsky_warehouses`**; колонки в каталоге.
- **Stock upload**: нормализация SKU, алиасы складов (Луцк → Луцьк, Kyiv → Киев), тесты **`stock-upload.service.spec.ts`**.
- **Orders**: видимость для **MANAGER** (свои, store, managed contacts) — **`orders-manager-visibility.spec.ts`**.
- **Script**: **`cleanup-duplicate-missed-call-tasks.ts`** для очистки дублей после миграции.
- **Mobile** (в репозитории): экраны contacts/leads/orders/tasks/visits, offline queue, API layer.

### Changed

- **Tasks**: **`callId`** в list/create API и web **`/tasks`**.
- **Catalog**: остатки по новым складам, **`qtyAtWarehouse`**.
- **Leads**: модалки create/edit.

### Fixed

- **`catalog/page.tsx`**: восстановлена функция **`qtyAtWarehouse`** (синтаксис).
- **`orders.setOrderStage`**: **`contact.ownerId`** в select для **`assertOrderAccess`**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.92`**.
- **Миграции:** **`20260624143000_task_call_id`**, **`20260625120000_add_kyiv_lutsk_khmelnitsky_warehouses`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.
- После миграции при необходимости: **`ts-node scripts/cleanup-duplicate-missed-call-tasks.ts`** (dry-run, затем apply).

## [0.2.91] — 2026-06-24

### Summary

Патч **0.2.91**: **daily work agenda** — утренний план дня (visits, tasks, contact actions, suggestions, commit/draft, auto-complete); доработки **leads** (convert, modal, filters), **calls** UI.

### Added

- **Daily agenda**: `DailyWorkPlan` / `DailyWorkPlanItem`, миграция **`20260624120000_daily_work_plan`**; API **`GET/POST /work/daily-agenda`**, draft/commit, patch item; страница **`/work/daily-agenda`**, виджет на Dashboard, **`docs/daily-agenda/overview.md`**.

### Changed

- **Leads**: convert traceability (region/address, company/contact guards), расширенные тесты; **LeadModal**, **LeadsFiltersPopover**, pipeline default stage.
- **Calls**: **CallCard**, история звонков; shell nav.
- **Orders**: мелкие правки kanban/cards.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.91`**.
- **Миграция:** **`20260624120000_daily_work_plan`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.

## [0.2.90] — 2026-06-23

### Summary

Патч **0.2.90**: настройки **плана на день** (шаблоны office/field, override по сотруднику), **auto-update** через cron, рефакторинг **kanban** заказов, доработки employees/orders UI.

### Added

- **Day plan settings**: `GET/PATCH /settings/day-plan`, per-user override API, **`UserDayPlanOverride`**; миграция **`20260623120000_user_day_plan_override`**; страница **`/settings/day-plan`**, редактор шаблонов, секция в карточке сотрудника.
- **Auto-update**: `SystemAutoUpdateCron` (`AUTO_UPDATE_ENABLED`, `AUTO_UPDATE_CRON`, `tryAutoApply` в updater agent).
- **Web**: shared **`KanbanLoadSentinel`**, **`useKanbanInfiniteColumns`**; **`DocumentsRequestedBadge`**; API proxy **`/api/settings/day-plan`**.

### Changed

- **Orders**: kanban (orders/financial/returns) — infinite scroll, i18n; **OrderModal** / **OrderPaymentBlock** UX.
- **Employees**: org chart layout, route address field.
- **Dashboard / day-plan**: учёт настраиваемых порогов и шаблонов.
- **compose.client.yml** / **updater agent**: env для auto-update; **suprex/README**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.90`**.
- **Миграция:** **`20260623120000_user_day_plan_override`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.
- Auto-update (опционально): `AUTO_UPDATE_ENABLED=true`, `CRON_ENABLED=true`, `AUTO_UPDATE_CRON` в env backend/updater.

## [0.2.89] — 2026-06-23

### Summary

Патч **0.2.89**: **план на день** (day plan), work hub, доработки контактов/NP/курсов; **фикс Telegram в prod** — `NotificationsModule` в **`AppModuleCore`** (раньше был только в полном `AppModule`, core API не поднимал notifications → доставка через Telegram не работала).

### Added

- **Day plan**: `DayPlanModule`, `GET /work/day-plan`, scoring, виджет и страница **`/work/day-plan`**; колонка плана на Dashboard.
- **Work hub**: **`/work/calls`**, queue/history, **`/work/warehouse`**.
- **Contacts**: work queue, расширенные фильтры.
- **NP**: `declaredCostMode` (minimum_200 / order_total), TTN defaults API, доработки **`TtnModal`**.
- **Exchange rates**: **`UAH_TO_EUR`**, нормализация курсов EUR/USD.
- **Telegram**: регрессионный тест **`telegram-di.spec.ts`** (circular import guard).

### Fixed

- **`AppModuleCore`**: добавлен **`NotificationsModule`** — in-app уведомления и Telegram delivery в **crm-core-api**.
- **Web CI**: `useMemo` на Dashboard; **Suspense** на `/work/day-plan`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.89`**.
- **Новых миграций нет** (day plan на существующих данных).
- С **0.2.79**: миграции **0.2.81** (3 шт.) и **`20260615120000_add_order_fx_write_off`** (0.2.87+) — если ещё не были.

## [0.2.88] — 2026-06-16

### Summary

**Hotfix 0.2.88**: CI **0.2.87** падал на сборке **web** — TypeScript error в **`payments/page.tsx`** (`t.orders.stages` не существует в локалях).

### Fixed

- **`payments/page.tsx`**: метки стадий заказа в очереди FX variance — **`t.planning.orderStages`**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.88`**. Содержимое = **0.2.87** + hotfix; **новых миграций нет**.
- **Не использовать 0.2.87** (образ web не собран).
- Миграция **`20260615120000_add_order_fx_write_off`** — как для **0.2.87**.

## [0.2.87] — 2026-06-16

### Summary

Патч **0.2.87**: **списание курсовой разницы (FX variance)** по заказам в USD/EUR — очередь на странице платежей, API write-off, учёт в долге и автозавершение заказа.

### Added

- **Order FX write-off**: поля **`fxWriteOffAmount`**, **`fxWriteOffNote`**, **`fxWriteOffAt`**, **`fxWriteOffByUserId`**; миграция **`20260615120000_add_order_fx_write_off`**.
- **Backend**: **`FxVarianceService`**, **`computeFxVarianceSnapshot`** (порог ≤ $2, остаток UAH ≤ 50), endpoints **`GET /orders/fx-variance-queue`**, **`GET /orders/fx-variance-queue/summary`**, **`POST /orders/:id/fx-write-off`**.
- **Web**: очередь FX variance на **`/payments`**, **`FxWriteOffModal`**, блок в **`OrderModal`**, API proxy routes.
- **i18n**: строки FX write-off (uk/en).

### Changed

- **`order-payment-guards`**: effective debt учитывает **`fxWriteOffAmount`**.
- **`OrdersService`**: в карточке заказа — **`fxVariance`** snapshot и **`isFxVarianceCandidate`**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.87`**.
- **Миграция:** **`20260615120000_add_order_fx_write_off`** — `prisma migrate deploy` / **`backend-migrate`** до **`up`**.
- С **0.2.79**: также 3 миграции **0.2.81** (если ещё не были).

## [0.2.86] — 2026-06-16

### Summary

Патч **0.2.86**: доработки web после **0.2.85** — прокси API уведомлений, UX адресов контактов/компаний, обработка ошибок на странице настроек уведомлений.

### Added

- **Web**: API routes **`/api/notifications`** и **`/api/notifications/[...path]`** — прокси к backend notifications.

### Changed

- **`EntityAddressesSection`**: выбор города через **`NpCitySelect`**, отдельная загрузка Google Maps script, улучшенный geocode/autocomplete (город + адрес), подсказки и карта при редактировании.
- **`/settings/notifications`**: явные состояния loading / error / retry.
- **`NpDirectorySelects`**: экспорт **`cityNameOnly`** для переиспользования.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.86`**. Рекомендуемый prod-патч после **0.2.79** (включает **0.2.81** + hotfixes **0.2.82–0.2.86**).
- **Новых миграций нет**.
- С **0.2.79**: применить 3 миграции **0.2.81** (если ещё не были).

## [0.2.85] — 2026-06-16

### Summary

**Hotfix 0.2.85**: backend на **0.2.84** — login OK, но **`$queryRaw`** и **`$transaction`** падали (`_createPrismaPromise is not a function`, `runInChildSpan`). Причина — Proxy в `PrismaService` с **`value.bind(value)`**, ломавший `this` у методов Prisma client.

### Fixed

- **`prisma.service.ts`**: убран Proxy; Nest получает extended client напрямую с `onModuleInit` / `onModuleDestroy`.
- **`prisma.service.spec.ts`**: регрессия на `$queryRaw`, `$transaction`, model delegates.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.85`**. Содержимое = **0.2.81** + hotfixes **0.2.82–0.2.85**; **новых миграций нет**.
- **Не использовать 0.2.81 / 0.2.82 / 0.2.83 / 0.2.84** для prod.
- С **0.2.79**: после успешного деплоя применить 3 миграции **0.2.81** (если ещё не были).

## [0.2.84] — 2026-06-16

### Summary

**Hotfix 0.2.84**: backend на **0.2.83** проходил healthcheck, но все запросы к БД падали с 500 — `Cannot read properties of undefined (reading 'findUnique')` (`this.prisma.user` undefined). Причина — **callback-form** `Prisma.defineExtension((client) => …)` в Prisma 7 не экспонирует model delegates на extended client.

### Fixed

- **`audit-prisma.extension.ts`**: extension переведён на **object-form** `defineExtension({ query: … })`; base client для audit writes — через `setAuditPrismaClient()`.
- **`prisma.service.ts`**: lifecycle через Proxy на object-form extended client (модели и `$connect` доступны).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.84`**. Содержимое = **0.2.81** + hotfixes **0.2.82** + **0.2.83** + **0.2.84**; **новых миграций нет**.
- **Не использовать 0.2.81 / 0.2.82 / 0.2.83** для prod.
- С **0.2.79**: после успешного деплоя применить 3 миграции **0.2.81** (если ещё не были).

## [0.2.83] — 2026-06-15

### Summary

**Hotfix 0.2.83**: backend crash loop на **0.2.82** — `TypeError: target.$connect is not a function` в `PrismaService`. Extended Prisma client (`$extends`) не экспонирует `$connect`/`$disconnect`.

### Fixed

- **`prisma.service.ts`**: lifecycle (`$connect`, `$disconnect`, `onModuleInit`) маршрутизируется на **base** `PrismaClient`; query — через extended client с audit extension.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.83`**. Содержимое = **0.2.81** + hotfixes **0.2.82** + **0.2.83**; **новых миграций нет**.
- **Не использовать 0.2.81 / 0.2.82** для prod.
- С **0.2.79**: после успешного деплоя применить 3 миграции **0.2.81** (если ещё не были).

## [0.2.82] — 2026-06-15

### Summary

**Hotfix 0.2.82**: backend crash loop на **0.2.81** — `TelegramService` DI (`SettingsService` undefined). Причина — circular import через `settings.service` → `ringostat-ingest` → `notifications` → `telegram` → `settings`.

### Fixed

- **`ringostat.constants.ts`**, **`kyivstar-fmc.constants.ts`** — provider IDs вынесены из ingest services; `settings.service` больше не тянет notifications chain.
- **`NotificationsModule`**: `forwardRef(() => TelegramModule)`.
- **`NotificationsDeliveryService`**: `forwardRef(() => TelegramService)`.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.82`**. Содержимое = **0.2.81** + hotfix; **новых миграций нет**.
- Если откатились с **0.2.81** на **0.2.79** — после **0.2.82** снова нужны 3 миграции **0.2.81** (если ещё не применены).

## [0.2.81] — 2026-06-15

### Summary

Патч **0.2.81**: **уведомления** (in-app bell, preferences); **адреса** contact/company (множественные, backfill, visits); **скидки** по строкам заказа; **audit** (change history, prisma extension); **analytics/payments** в базовой валюте; доработки **OrderModal**, **payments** UI.

### Added

- **Notifications**: `UserNotification`, preferences, `NotificationBell`, `/settings/notifications`, `/notifications`.
- **Entity addresses**: `ContactAddress`, `CompanyAddress`, API CRUD, `EntityAddressesSection`, Bitrix address sync; visit `contactAddressId` / `companyAddressId`.
- **Orders**: `discountPercent` на `OrderItem`, settings `/settings/order-discounts`, `order-line-total.utils`.
- **Audit**: `AuditAccessService`, `audit-prisma.extension`, `EntityChangeHistoryPanel`.
- **Web**: `TtnStatusBadge`, `useBaseCurrency`, analytics в base currency; payments page refactor.

### Changed

- **ContactModal** / **CompanyModal** — адреса, change history, упрощение layout.
- **OrderModal** — скидки по строкам, split-by-stock, returns settlement UX.
- **Analytics** — суммы через `getBaseCurrency` / `paymentToBase`.
- **Integrations** — audit context на ingest/cron (Bitrix, Ringostat, Kyivstar, NP).
- **Leads convert** — traceability tests расширены.
- **Warehouse** — мелкие правки.

### Fixed

- **ContactModal** — merge conflict (`NEXT_ACTION_OPTIONS`).
- **CompanyModal** — duplicate `Company` type.
- **EntityAddressesSection** — null-safe geocode.
- **Dashboard** — `currency` в empty team activity.
- **order-discounts** settings — `subtitle` prop.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.81`**, повний манифест (8 modules).
- **`prisma migrate deploy`**: `20260612120000_add_user_notifications`, `20260615120000_add_order_item_discount_percent`, `20260615140000_add_entity_addresses`.

## [0.2.80] — 2026-06-12

### Summary

Патч **0.2.80**: **баланс клієнта** (contact/company credit), **повернення** — settlement CREDIT/REFUND/SPLIT; **guards** переходів `orderStage` (оплата, ТТН НП); доработки **OrderModal**, **FinancialKanban**, **SearchableSelect** (portal dropdown); **updater** — sync active job з agent.

### Added

- **`client-balances`**: `ClientBalance`, транзакції, apply credit до замовлення; API `/client-balances/*`; proxy на finance sidecar.
- **Returns**: `ReturnSettlementType`, settlement preview, credit/refund/split при закритті повернення; `PaymentSourceType.CREDIT`.
- **Orders**: `order-stage-prerequisites`, `order-payment-guards`, `order-completion-guards` — валідація forward transitions.
- **Web**: `OrderClientBalancePanel`, settlement modal у **OrderModal**; BFF `settlement-preview`.
- **UI**: `FixedDropdownPortal`, `AddressSuggestionsDropdown`; рефактор **NpDirectorySelects** / **SearchableSelect**.

### Changed

- **OrderModal** / **FinancialKanban** / **OrdersKanban** — баланс, повернення, stage UX.
- **Contacts** KPI — balance hint; modals (company/contact/lead) — select overlays.
- **System update**: `loadUpdaterState`, HTTP exceptions; **Settings → Health** — polling job status.
- **Settings home** — link на Health при `agent_available`.

### Fixed

- **`settlement-preview` BFF route** — param `id` (CI `tsc`).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.80`**, повний манифест (8 modules).
- **`prisma migrate deploy`** — `20260612120000_client_balance`.

## [0.2.79] — 2026-06-11

### Summary

Патч **0.2.79**: **Kyivstar FMC** (`int.kyivstar_fmc`) — импорт звонков, webhooks, recordings, settings UI; **field shifts** + **/visits/team** (карта менеджеров, GPS-трек); **mobile** — фоновый GPS, EAS dev build; доработки **warehouse**, **orders** (legacy status mapping), **tasks**, **fuel**.

### Added

- **Integration `kyivstar-fmc`**: ingest, polling, backfill, workspace API; sidecar `crm-module-kyivstar-fmc`, `compose.modules.kyivstar-fmc-sidecar.yml`, proxy `KYIVSTAR_FMC_UPSTREAM_URL`.
- **Web**: `/settings/kyivstar-fmc`, BFF integrations; **`/visits/team`** — TeamFieldMap/List, pending fuel.
- **Field**: `FieldShiftsService` — start/stop shift, location samples batch, team view; API `/field/shifts/*`.
- **Mobile**: фоновый location tracking (`location-tracking-task`, `shift-tracking-context`), `eas.json`, разрешения в `app.json`.
- **Prisma**: миграция **`20260609120000_lead_source_kyivstar`** — `LeadSource.KYIVSTAR`.
- **CI**: module image **`kyivstar-fmc`** в полном манифесте 0.2.x.

### Changed

- **Warehouse workspace**: расширенный UI збірки, переходы `READY_TO_SHIP` ↔ `CONFIRMED`.
- **Orders**: legacy `Order.status` → `orderStage` mapping (фильтры, kanban); fulfillment queue fields.
- **Tasks**: фильтры/отображение; **EntityTasksList** — доработки.
- **Visits**: subnav (team), fuel/history pages; **Settings → Health** — мелкие правки.
- **Leads/Contacts**: source Kyivstar в модалках.
- **Store**: категории / PopularSystems.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.79`**, полный манифест (8 module images + store).
- **`prisma migrate deploy`** — `20260609120000_lead_source_kyivstar`.
- Kyivstar sidecar: **`KYIVSTAR_FMC_UPSTREAM_URL`** на `backend`, **`KYIVSTAR_FMC_CRON_DISABLED=true`** на core при worker.

## [0.2.78] — 2026-06-05

### Summary

Патч **0.2.78**: **one-click update** — сервіс `updater` у `compose.client.yml` (Docker socket + `agent.mjs`); спрощений UI **Settings → Health**; warehouse workspace показує **коментар** і **документи** замовлення.

### Added

- **`scripts/updater/Dockerfile`** + сервіс **`updater`** у compose (порт 7788, `UPDATER_AGENT_URL=http://updater:7788` за замовчуванням).
- **Fulfillment queue**: поле **`comment`** у відповіді API; **`documentsRequested`** у типах web.

### Changed

- **Settings → Health**: одна кнопка «Оновити» (preflight + apply); діагностика прихована за toggle.
- **Warehouse workspace**: блок «Документи» / «Коментар» у модалці збірки.
- **`.env.client.example`**: updater тепер через compose, без ручного `UPDATER_AGENT_URL` на хості.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.78`**, повний манифест; міграцій немає.
- Після `pull` / `up -d` з’явиться контейнер **`updater`**; потрібен доступ до **`/var/run/docker.sock`** на хості.
- Опційно: **`UPDATER_AGENT_TOKEN`** — спільний секрет backend ↔ updater.

## [0.2.77] — 2026-06-05

### Summary

Патч **0.2.77**: **склад** — workspace только для збірки (`CONFIRMED` → `READY_TO_SHIP`); **stock readiness** (NONE/PARTIAL/FULL) на замовленнях `AWAITING_STOCK`; legacy `Order.status` у фільтрах і kanban; **updater agent** env у compose; seed demo-замовлення для WAREHOUSE; роль **`formatUserRole`** у web.

### Added

- **`order-stock-readiness`**: обчислення наявності по складу / `Product.stock`; поле **`stockReadiness`** у списку замовлень.
- **Web**: **`StockReadinessBadge`**, бейдж на kanban для `AWAITING_STOCK`; **`roleLabels`**.
- **Backend**: **`legacyStatusesForOrderStage(s)`** — фільтр `orderStages` враховує legacy `status`.
- **Seed**: demo WH-DEMO-STOCK / WH-DEMO-PICK / WH-DEMO-SHIP для ролі WAREHOUSE.
- **Compose / env**: `UPDATER_AGENT_URL`, `UPDATER_AGENT_TOKEN`, `CRM_RELEASE_VERSION`, `GIT_SHA`, `BUILD_TIME`, `IMAGE_TAG`; `npm run dev:updater`.
- **Settings → Health**: ручний target version для update flow.

### Changed

- **Warehouse workspace** (`/work/warehouse`): лише `CONFIRMED`, модалка збірки, без вкладок picking/shipping.
- **WAREHOUSE role**: дозволені переходи `CONFIRMED` ↔ `READY_TO_SHIP`; fulfillment queue = тільки `CONFIRMED`.
- **OrdersKanban**: legacy status → stage mapping; warehouse mode фільтрує на клієнті.
- **OrderModal**: warehouse stepper спрощено під workspace.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.77`**, повний манифест; міграцій немає — `pull` / `up -d`.
- Опційно: `UPDATER_AGENT_URL` + `UPDATER_AGENT_TOKEN` на хості для кнопки оновлення в Settings → Health.

## [0.2.76] — 2026-06-05

### Summary

Патч **0.2.76**: **fix CI** — web **`fulfillment-queue`** route (`NextRequest`); повторная попытка после падений **0.2.74** (backend `google-drive`) и **0.2.75** (web build). Содержимое = **0.2.75** (bank Privat24/UPC + **0.2.74** features).

### Fixed

- **`apps/web/.../fulfillment-queue/route.ts`**: `Request` → `NextRequest` для `proxyToBackend`.
- **`apps/web/.../route-plans/geometry/preview/route.ts`**: убран 3-й аргумент у `proxyToBackend` из `proxy.server` (2-arg API).
- **`RouteLayerControls`**: тип `ROUTE_LAYER_STYLES` → `google.maps.PolylineOptions` (CI `tsc`).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.76`**, полный манифест, миграции как у **0.2.75**.

## [0.2.75] — 2026-06-05

### Summary

Патч **0.2.75**: **fix CI** — TypeScript в **`google-drive.client`** (0.2.74 не собрался); **банк** — Privat24/UPC как integrations, payment matching, settings UI; рефакторинг bank sync/providers. Включает **0.2.74** (WAREHOUSE, route geometry, fulfillment queue).

### Fixed

- **`google-drive.client.ts`**: тип `DriveAuth` — совместимость с `google.drive()` в Docker/CI (0.2.74 падал на `tsc`).

### Added

- **Integrations**: **`privat24`**, **`upc`** (consent, sync); **`payment-matching.service`**, **`bank-provider.registry`**.
- **Web**: settings **bank / privat24 / upc**, API integrations.
- **Prisma**: миграция **`bank_providers_upc_matching`** (UPC provider, match status на транзакциях).

### Changed

- Bank module — провайдеры вынесены из legacy `privat24.client`; FOP settings упрощены.
- **Module registry** / contracts — Privat24 module id.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.75`**, полный манифест.
- **`prisma migrate deploy`** — **`20260603120000_add_warehouse_user_role`** (если пропущена с 0.2.74) + **`20260603120000_bank_providers_upc_matching`**.

## [0.2.74] — 2026-06-03

### Summary

Полный релиз **0.2.x**: роль **WAREHOUSE**, очередь комплектации заказов, **route geometry** (polyline, карта web/mobile), доработки **visits/fuel**, **orders** kanban, **contacts/timeline**, **field-fuel**, **Ringostat** ingest, **stock SKU**; миграция **`add_warehouse_user_role`**.

### Added

- **RBAC**: роль **`WAREHOUSE`**, `order-warehouse-role`, fulfillment queue API/UI (`/work/warehouse`).
- **Visits**: `polyline.util`, route geometry types, BFF **`/api/route-plans/geometry`**; mobile **`route-map.ts`**.
- **Web**: visits map components, **`activityDisplay`**, **`contact-address.util`**, orders resource.
- **Docs**: **`docs/commercial-proposal-uk.md`**.

### Changed

- **Route plans** — геометрия маршрута, controller/service.
- **Orders** — фильтры/очередь для warehouse role; kanban/page.
- **Field fuel**, **Ringostat ingest**, **stock-sku-normalizer**, **contacts** card/timeline.
- **Visits** history/fuel/page, **catalog**, entity modals, locales.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.74`**, полный манифест.
- **`prisma migrate deploy`** — enum **`UserRole.WAREHOUSE`** (`20260603120000_add_warehouse_user_role`).
- Сайдкары: **`NP_UPSTREAM_URL`** и др. на `backend`.

## [0.2.73] — 2026-05-25

### Summary

Патч **0.2.73**: **остатки по SKU** — нормализация артикулов (кириллица/латиница) при загрузке Excel; **модалки** leads/orders/companies/contacts — выравнивание layout и UX.

### Added

- **`stock-sku-normalizer`** + тесты; **`prepareBulkWarehouseStock`** в `ProductStore`.

### Changed

- **Products controller** — bulk stock через новый резолвер SKU.
- **Web modals**: Lead, Order, Company, Contact, CreateLead/Order.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.73`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.72] — 2026-05-25

### Summary

Патч **0.2.72**: **НП ТТН** — просмотр/редактирование, update с `Ref`/`IntDocNumber`; **TtnModal** и BFF; **сотрудники** — адрес маршрута (`RouteAddressInput`, Google Places); доработки модалок **company/contact/lead/order**; локали.

### Added

- **Backend NP**: `getTtnDetailsByOrderId`, редактирование черновика ТТН; контроллер endpoints.
- **Web**: `RouteAddressInput`, `useRouteAddressField`; расширенный **TtnModal**.

### Changed

- **EmployeeModal** — рефакторинг, маршрут start/end через Places.
- **OrderModal**, **CompanyModal**, **ContactModal**, **LeadModal** — адреса/Places.
- **googlePlacesNew** — мелкие правки.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.72`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.71] — 2026-05-25

### Summary

Патч **0.2.71**: **контакты** — новый UX модалки (`ContactCreateForm`, регионы, проверка дубликата телефона), обязательный **region** при создании; **EntityModalShell**; локали; очередь звонков и компании — мелкие правки.

### Added

- **Web**: `ContactCreateForm`, `contact-region-options`, `useContactPhoneDuplicateCheck`.
- **Docs**: `UX-MODALS.md`.

### Changed

- **ContactModal** — рефакторинг под shell; **contacts/companies** pages.
- **Backend**: `region` required в create contact DTO/service.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.71`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.70] — 2026-05-25

### Summary

Патч **0.2.70**: **Nova Poshta** — кнопка **«Синхронізувати довідники»** в настройках (города/отделения), BFF **`POST /api/np/sync`**, локали en/uk.

### Added

- **Web**: `apps/web/src/app/api/np/sync/route.ts`, UI sync в **`/settings/nova-poshta`**.

### Changed

- Подсказки отправителя: сначала синхронизация справочников.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.70`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.69] — 2026-05-25

### Summary

Полный релиз **0.2.x**: **склады** (CRUD API, DTO, модалка в каталоге), доработки **остатков** и заказов; **Nova Poshta** — выбор отправителя из справочников (counterparties/contacts), обновлённый UI настроек и локали.

### Added

- **Warehouses**: `create`/`update`/`delete`, уникальность name/externalCode; **web** `WarehousesModal`, BFF warehouses API.
- **NP settings**: `NpDirectorySelects`, API sender-counterparties/contacts, `np-sync` helpers.

### Changed

- **Catalog**, **stock-upload**, **products** — привязка к складам.
- **Orders** modals — выбор склада.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.69`**, полный манифест; миграций Prisma нет — `pull` / `up -d`.

## [0.2.68] — 2026-05-20

### Summary

Патч **0.2.68**: **Visits** — план маршрута для **MANAGER** по умолчанию показывает **свои** визиты (`ownerId` = текущий пользователь), если фильтр владельца скрыт.

### Fixed

- **Web** `visits/page.tsx`: `planOwnerOpts` с `useMemo` — менеджер без ADMIN/LEAD видит свой план, а не «всех».

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.68`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.67] — 2026-05-20

### Summary

Полный релиз **0.2.x** (все module-образы в CI): **voice gateway** — `gateway-service` (Kyivstar, RTP allocator, media bridge), новый **`sip-adapter-service`**, **`compose.modules.voice-gateway.yml`**, док **`docs/voice-gateway-deploy.md`**; **visits** — owner scope, маршруты/сессии; **web** — каталог (поиск), план визитов; **field-fuel** — мелкие правки.

### Added

- **`apps/sip-adapter-service`**: HTTP API, FreeSWITCH ESL, outbound/media attach.
- **`apps/gateway-service`**: Dockerfile, `rtp-port-allocator`, расширение Kyivstar provider.
- **`compose.modules.voice-gateway.yml`**, **`visits-owner-scope.ts`**, **`catalog-search.ts`**.

### Changed

- **Route plans / sessions / visits** — scope по владельцу, API и UI.
- **Gateway orchestrator** — lifecycle, canary, webhook client.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.67`**, полный манифест + `pull` / `up -d`.
- **Voice gateway** (опционально): overlay **`compose.modules.voice-gateway.yml`**, env см. **`docs/voice-gateway-deploy.md`** (образы gateway/sip — local build в compose, не в стандартном GHCR module CSV).
- Сайдкары: **`NP_UPSTREAM_URL`** и др. — **`docs/modules-prod-matrix.md`**.

## [0.2.66] — 2026-05-20

### Summary

Патч **0.2.66**: **каталог** (карточка товара, панель характеристик), **история визитов** (фильтры, координаты на карте), **сотрудники** — полевой профиль топлива в API/UI; **visit-coordinates**, доработки **route-plans** и **field-fuel**.

### Added

- **Catalog**: `CatalogProductCard`, `ProductCharacteristicsPanel`.
- **Visits history**: `visit-history-utils`, расширенный UI и API.
- **Backend**: `visit-coordinates.ts`, тесты; **users** — `fieldProfile` в list/update.

### Changed

- **Route plans**, **visits service**, **field-fuel** — уточнения расчётов/координат.
- **EmployeeModal** — настройки авто/топлива для менеджера.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.66`**, полный манифест; миграций Prisma в этом патче нет (если уже на **0.2.65** — достаточно `pull` / `up -d`).

## [0.2.65] — 2026-05-20

### Summary

Полный релиз **0.2.x** (все module-образы в CI): **топливные отчёты** (снимок визитов, пересчёт, export), **route geometry** для маршрутов, **Field API** (fuel day/range/profile, events/listener), **web** — раздел **Visits → Fuel**, BFF **`/api/field/fuel/*`**; **mobile** — экраны топлива и профиль авто. Миграция **`fuel_report_visit_snapshot`**.

### Added

- **Fuel**: `FuelDayReport` snapshot/metrics, `field-fuel.listener`, recalculate/submit; **web** `visits/fuel`, **mobile** `app/fuel/*`.
- **Visits**: `route-geometry.ts`, тесты; доработка `route-plans.service`.
- **Web API**: `field-fuel` resource, `VisitsSubNav`.

### Changed

- **Field fuel service** — расширенный расчёт и статусы компенсации.
- **Mobile** tabs (index, more), docs **`05-api-changes`**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.65`**, **`prisma migrate deploy`** (колонки `FuelDayReport`), полный манифест + `pull` / `up -d`.
- Сайдкары: **`NP_UPSTREAM_URL`** и др. — **`docs/modules-prod-matrix.md`**.

## [0.2.64] — 2026-05-15

### Summary

Полный релиз **0.2.x** (все module-образы + store в CI): **мобильное приложение менеджера** (Expo), **Field API** (смены, GPS-трек, топливо), **GPS-верификация визитов**, доработки **store** (корзина, UI), **web** proxy/companies, Prisma-миграция. Включает **0.2.61–0.2.63** (Google Drive, companies, NP docs).

### Added

- **`apps/mobile`**: Expo-клиент (визиты, смена, карта, клиенты) — см. **`docs/mobile-manager-app/`**.
- **Backend `FieldModule`**: `/field/...` — смены, location samples, fuel day reports; **`VisitGpsEvent`**, верификация start/complete визита.
- **Prisma**: миграция `20260515193000_mobile_field_gps_fuel`.
- **Store**: `CartContext`, улучшения cart/product UI.
- **Web**: `proxy-request-headers`, companies `[id]` API.

### Changed

- **Visits**: `GET /visits/:id`, GPS payload на start/complete.
- **Nginx/docs**: suprex.dental, operator runbook.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.64`**, полный манифест + **`prisma migrate deploy`** (новые таблицы field/GPS).
- Сайдкары: **`NP_UPSTREAM_URL`** и др. на `backend` — **`docs/modules-prod-matrix.md`**.

## [0.2.63] — 2026-05-15

### Summary

Полный релиз линии **0.2.x**: CI собирает **все** образы — **`crm-backend-core`**, **`crm-core-api`**, **`crm-web`**, **`crm-store`**, модули **outbound**, **google-sheet**, **ringostat**, **bitrix**, **np**, **finance**, **planning**. Манифест с **`compose.base.yml`**, **`compose.client.yml`**, **`compose.modules.store.yml`** и всеми **`compose.modules.*-sidecar.yml`**, **`composeFileUrls`**. Код = **0.2.62** (Google Drive, companies, NP docs).

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.63`**, целевой релиз в CP, **`client-pull-agent`** или полный **`docker compose pull`** по **`composeFiles`** из манифеста + **`up -d`** (при смене состава — **`--remove-orphans`**).
- При сайдкарах в манифесте: на **`backend`** задайте **`NP_UPSTREAM_URL`**, **`OUTBOUND_UPSTREAM_URL`** и т.д. (см. **`docs/modules-prod-matrix.md`**, **`docs/np-module-prod.md`**).
- Фото каталога: **Settings → Google-таблиця**; NP: **Settings → Nova Poshta**.

## [0.2.62] — 2026-05-15

### Summary

Патч **0.2.62**: создание компании **только с именем**; опциональные поля как `null` не ломают валидацию; ответственный по умолчанию — создатель; форма создания в web.

### Fixed

- **Companies**: DTO create/update — корректная обработка `null` для необязательных полей; create без пустых полей; **`ownerId`** по умолчанию от текущего пользователя.
- **Web**: **`CompanyModal`** — создание с одним именем, автоподстановка ответственного.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.62`**, `pull` / `up -d` (или **`client-pull-agent`**).

## [0.2.61] — 2026-05-15

### Summary

Патч **0.2.61**: **Google Drive** для фото каталога — папка и service account в **Settings → Google-таблиця** (БД), с fallback на env; прокси картинок без auth cookie; **MANAGER** может создавать/редактировать свои компании; **compose.client.yml** — проброс `GOOGLE_*` в `backend`; документация **NP sidecar** (`NP_UPSTREAM_URL` / `NP_WRITES_DISABLED` / CP manifest).

### Added

- **Settings → Google-таблиця**: `driveFolderId`, `serviceAccountJson`; **`resolveGoogleDriveConfig()`** для sync и proxy.
- **Web**: UI Drive в **`/settings/google-sheet`**; публичный BFF **`/api/products/images/.../source`** (stream с backend).

### Changed

- **Product images**: sync/proxy через credentials из Settings; **`google-drive.client`** принимает auth снаружи.
- **Companies**: **MANAGER** на create/update; update только своих компаний.
- **Catalog**: ссылка на настройки Drive вместо env-only подсказки.
- **Docs**: NP sidecar vs `.env`, **`docs/cp-v0.2.3.md`**, **`.env.base.example`**, чеклист suprex под **0.2.61**.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.61`**, манифест + **`client-pull-agent`** или **`pull` / `up -d`**. Фото товаров: **Settings → Google-таблиця** (или env **`GOOGLE_*`** в **`compose.client.yml`**). NP sidecar: **`NP_UPSTREAM_URL=http://backend-np:3001`** — см. **`docs/np-module-prod.md`**.

## [0.2.6] — 2026-05-17

### Summary

Патч **0.2.6**: доработки **модульного прокси** (rewrite путей к upstream), **Nova Poshta** (TTN/клиент/константы, настройки в CRM вместо env), **Settings** (Nova Poshta API + UI), **module state / registry**, **Bitrix** webhook, мелкие правки **outbound / planning**; **web** — RBAC BFF на **`[[...path]]`**, redirect **`/api/api/*`**, гейтинг **«Nova Poshta»** в настройках, локали и health; документация **`docs/modules-prod-matrix.md`**, **`docs/np-module-prod.md`**; контрактные/юнит-тесты модулей и прокси.

### Added

- **`apps/web`**: страница и API-прокси **Settings → Nova Poshta**; **`apps/backend`**: расширение **`settings.service`** / controller под NP integration.
- **`module-upstream-path-rewrite`** и тесты; **`np.constants`**, **`modules-prod-contract.spec.ts`**.
- Доки: **`docs/modules-prod-matrix.md`**, **`docs/np-module-prod.md`**.

### Changed

- **NP module**: `np-ttn`, client, catalog/cron sync, module wiring.
- **Module proxy**: `module-upstream-proxy.setup`, health/registry/state.
- **Web**: `next.config` redirects; `api/rbac` optional catch-all segment; `api/client`, outbound/settings layouts, settings home link.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.6`**, манифест + **`client-pull-agent`** или **`pull` / `up -d`**. Конфиг НП в проде — см. **`docs/np-module-prod.md`**.

## [0.2.5] — 2026-05-16

### Summary

Патч **0.2.5**: очередной выпуск линии **0.2.x**; рекомендуемый тег образов и манифеста для прода после зелёного **Publish Registry Release**.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.5`**, затем **`pull` / `up -d`** (или **`client-pull-agent`**) по манифесту с **`composeFileUrls`** и **`compose.modules.store.yml`**.

## [0.2.4] — 2026-05-15

### Summary

Патч **0.2.4**: манифест для Control Plane по умолчанию включает **`compose.modules.store.yml`** (вместе с **`composeFileUrls`**), чтобы **`client-pull-agent`** и **`docker compose`** поднимали **`crm-store`** без отдельного PATCH; обновлены операторские доки (**`docs/cp-v0.2.3.md`**, **`docs/bio3ua-core-only.md`**, **`README.md`**).

### Added

- **`compose.modules.store.yml`** в **`composeFiles`** / **`composeFileUrls`** при **Publish Registry Release** и в **`rollout-loop-dry-run`**.

### Changed

- **`docs/cp-v0.2.3.md`**: манифест vs лицензия, **`moduleCodes`** vs подписка, **`metadata.ci_unknown_root_fields`**, preflight сервера (**`LICENSE_FILE_PATH_HOST`**, orphan-сервисы, полный **`-f`**); allowlist CP для **`compose.modules.store.yml`**.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.4`**, затем манифест из CI/CP (с **`compose.modules.store.yml`**) и **`client-pull-agent`** или **`pull` + `up -d`** с полным **`-f`**.

## [0.2.3] — 2026-05-14

### Summary

Патч **0.2.3**: манифест релиза для Control Plane дополняется **`composeFileUrls`** (ссылки на compose в GitHub по SHA коммита), плюс скрипты для клиента (**`sync-compose-from-manifest`**, **`suprex/client-pull-agent.sh`**). Рекомендуемый образ для прода после зелёного CI.

### Added

- **`composeFileUrls`** в `deployment-manifest.json` при **Publish Registry Release** (URL на `raw.githubusercontent.com` по полному SHA коммита GitHub Actions) для **каждого** пути из **`composeFiles`**.
- **`scripts/sync-compose-from-manifest.mjs`** и **`suprex/client-pull-agent.sh`**: скачивание отсутствующих compose с хоста и **`docker compose … pull`** по списку `-f` из манифеста.

### Changed

- В манифесте поле **`gitSha`** — полный SHA коммита (согласовано с URL raw compose).
- **`scripts/rollout-loop-dry-run.sh`**: те же `composeFileUrls` в dry-run, исправлен путь к **`resolve-modules-csv.mjs`** через **`REPO_ROOT`**, **`compatibility.line`** из версии.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.3`**, затем pull/up. Для install bundle без полного git clone: **`MANIFEST_URL`** (или локальный манифест) + **`suprex/client-pull-agent.sh`** — см. **`docs/RELEASING.md`** и **`docs/cp-v0.2.3.md`**.
- **Control Plane** должен хранить и отдавать **`composeFileUrls`** в JSON манифеста (см. **`docs/cp-v0.2.3.md`**).

## [0.2.2] — 2026-05-13

### Summary

Патч-релиз **0.2.2** по линии **0.2.x**: исправления инфраструктуры релиза и манифеста, чтобы **образ `crm-backend-core`**, **список `composeFiles` для Control Plane** и **сборка web** соответствовали ожиданиям операторов и client-pull-agent.

### Fixed

- **Docker / `crm-backend-core`**: последний stage в `apps/backend/Dockerfile` больше не «уезжает» в `planning-runner`; добавлен финальный **`FROM runner`**. В **Publish Registry Release** и **Preflight** для образа backend явно **`target: runner`**. В **`docker-compose.prod.yml`** для `backend` указан **`target: runner`** при `--build`. Устраняет **`BACKEND_VARIANT=planning_worker`** у контейнера, который должен быть полным API.
- **CI module images**: `docker buildx imagetools inspect` — чтение digest через **`json .Manifest`** и fallback по тексту **`Digest:`** (совместимость с новым buildx).
- **Control Plane manifest**: роли optional module-образов — **`module`** (не `module_*`), кроме **`module_outbound`**; соответствие allowlist CP.
- **`composeFiles` в манифесте**: для `google-sheet` только **`compose.modules.google-sheet-sidecar.yml`**; удалён дублирующий **`compose.modules.google-sheet.yml`**. В **`ci-publish-module-builds.mjs`** проверка **существования каждого compose-пути** в репозитории перед записью addon.
- **Web production build**: в JSX заменены **`->`** на **`→`** в `outbound-voice` и `ringostat` settings (парсер JSX).

### Upgrade notes

- **Не использовать в проде теги образов `crm-backend-core:0.2.0`** (и при необходимости проверьте **`0.2.1`**, если собирался до фикса Dockerfile): рекомендуемый полный патч (**все module-образы**, **`composeFileUrls`**, **`compose.modules.store.yml`**) — **`0.2.91`**; иначе минимум **`0.2.6`** … **`0.2.2`** для `BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`, затем `pull` и `up -d`.
- После обновления CP: при необходимости **PATCH манифеста** (см. документацию CP) или перерегистрация релиза с валидным **`composeFiles`**.

## [0.2.0] — 2026-05-13

### Summary

Минорный релиз **0.2.0**: линия поставки **0.2.x**. В **Publish Registry Release** для версий **`0.2.*`** при **пустом** поле **modules** (в т.ч. при push тега `v0.2.*`, когда inputs нет) CI собирает **все** опциональные module-образы: outbound, google-sheet, ringostat, bitrix, np, finance, planning. Для **`0.1.*`** пустой CSV по-прежнему означает «без отдельных module-образов». Манифест для Control Plane получает **`compatibility.line`** вида **`M.m.x`** из версии релиза (например `0.2.x` для `0.2.0`). В образы входит код на момент тега/запуска workflow.

### Changed

- **CI / релиз**: `publish-release.yml` — при версии `0.2.*` и пустом CSV **modules** собираются все optional module images; `compatibility.line` в `deployment-manifest.json` выводится из semver (`0.2.x`, `0.1.x`, …).
- **Версии пакетов**: `apps/backend`, `apps/web`, `apps/store` → `0.2.0`.
- **Документация**: `README.md`, `docs/RELEASING.md`, `docs/git-release-workflow.md`, `.env.base.example` — линия **0.2.x** и примеры версий образов.

### Upgrade notes

- Клиентам на **0.1.x**: переход на **0.2.x** — минорный bump; сверить **compose**, **`.env`**, **миграции Prisma**, **license.json** / пилоты и **`MODULE_GATING_ENABLED`**. Patch-совместимость внутри **0.2.x** — по правилам в `README.md`.

## [0.1.5] — 2026-05-02

### Added

- **Core-only**: `AppModuleCore`, entrypoint `core-main`, образ `crm-core-api`, прокси/upstream для модулей; `BACKEND_VARIANT=core`.
- **Модули**: отдельные entrypoints/worker-образы, sidecar compose; скрипты `ci-publish-module-builds.mjs`, `resolve-modules-csv.mjs`.
- **Finance idempotency**: `FinanceIdempotencyRecord`, interceptor для идемпотентных POST.
- **Data import / custom entities**: Prisma-модели, API, BFF, UI настроек; job-flow импорта (upload → validate → commit).
- **Control Plane**: телеметрия phone-home, `GET /system/control-plane`, health UI.
- **Workflows**: лог executions API, события для company, product, task, activity; enum `TASK` / `ACTIVITY` в `CustomFieldEntityType`.
- **Layouts runtime**: `GET /layouts/runtime/list` (MetadataRead) для карточек.
- **Документация**: onboarding, git-release, e2e smoke, security baseline, customer success; контрактный тест deployment manifest в CI preflight.

### Changed

- Модульность: `@RequireModule` и compose overlays; обновлены `docs/CRM-modularity-structure.md`, runbook.
