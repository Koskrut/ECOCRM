# Nova Poshta (NP) module — production notes

## Architecture

- **License / gating**: `ModuleIds.NovaPoshta` (`int.nova_poshta`). UI and API routes use `@RequireModule` / `ModuleSection`.
- **Runtime**: `NpModule` — directories (`NpController`), TTN (`NpTtnController` + `NpTtnService`), store checkout search (`StoreNpController`), HTTP client (`NpClient`).
- **Optional sidecar**: `NP_UPSTREAM_URL` on the main API proxies `/np` (and related paths) to `backend-np` / `crm-module-np`. Main API can set `NP_WRITES_DISABLED=true` so TTN writes run only on the worker.
- **Proxy path fix**: static mounts restore the `/np` prefix when forwarding to the worker (see `module-upstream-proxy.setup.ts`).

## Configuration (Settings vs environment)

| Concern | Primary (Settings → Nova Poshta) | Fallback (env) |
|--------|-----------------------------------|----------------|
| API key | `IntegrationSetting.apiToken` | `NP_API_KEY` |
| API URL / timeout | `config.apiUrl`, `config.apiTimeoutMs` | `NP_API_URL`, `NP_API_TIMEOUT_MS` |
| Sender refs + phone | `config` JSON fields | `NP_SENDER_*` |
| Default payer / payment | `config` | `NP_DEFAULT_PAYER_TYPE`, `NP_DEFAULT_PAYMENT_METHOD` |
| Block writes on this process | — | `NP_WRITES_DISABLED=true` |
| Disable NP crons on this process | — | `NP_CRON_DISABLED=true` |
| Worker discovery | — | `NP_UPSTREAM_URL` |
| Internal module auth | — | `MODULE_INTERNAL_SECRET` (header `x-crm-module-internal`) |

**Prod recommendation**: store the **API key and sender data in Settings** (DB) so secrets are not only in container env; keep env for infra flags (`NP_UPSTREAM_URL`, `NP_WRITES_DISABLED`, cron toggles).

## Operational checklist

1. **License**: Nova Poshta entitled and enabled (Control Plane / license file as for other modules).
2. **Secrets**: Settings → Nova Poshta (or env) — API key + sender refs validated before TTN (`GET /np/sender/check`).
3. **Directories**: run NP sync (`POST /np/sync` or scheduled job) so `npCity` / `npWarehouse` caches exist.
4. **Sidecar** (if used): same DB URL as core; worker image version aligned with `BACKEND_VERSION`; `NP_WRITES_DISABLED` **not** `true` on worker; main API has `NP_UPSTREAM_URL` pointing at worker; deploy includes proxy path-rewrite fix.
5. **Observability**: monitor 502 from module proxy (`Module upstream unavailable`), NP API errors in logs, TTN cron (`NpTtnCron`) if enabled on worker only.

## UI entry points

- **Settings**: `/settings/nova-poshta` (admin, module-gated).
- **Orders**: TTN modal (unchanged).

## Registry note

`module-registry` still marks delivery as `in_process`; operationally NP may be split via `NP_UPSTREAM_URL`. The split is deployment-level, not a second module id.
