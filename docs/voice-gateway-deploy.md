# Voice gateway deploy (gateway + sip-adapter + FreeSWITCH)

## Stack

| Service | Role |
|---------|------|
| `gateway-service` | CRM outbound AI orchestration, OpenAI Realtime, RTP bridge |
| `sip-adapter` | HTTP B2B API for gateway, ESL to FreeSWITCH |
| `freeswitch` | SIP trunk to provider, RTP B2BUA (host network) |

Compose overlay: [`compose.modules.voice-gateway.yml`](../compose.modules.voice-gateway.yml).

## CRM settings

- Outbound voice: `runtimeMode = kyivstar_openai_gateway`
- **`apiBaseUrl`** — URL of **gateway** reachable from CRM `backend` container:
  - **Docker on Linux (recommended):** `http://172.17.0.1:3100` (docker0 bridge → host-published gateway port)
  - With reverse proxy: public HTTPS URL of gateway (port 3100)
- `apiToken` = `GATEWAY_API_TOKEN`
- Webhook secret = `CRM_WEBHOOK_SECRET` (same as `OUTBOUND_VOICE_WEBHOOK_SECRET` on backend)
- Backend: `CRON_ENABLED=true`

Check in CRM UI: **Settings → Outbound Voice** → `apiBaseUrl` must match the value above.

## Environment (names only — set real values in `.env`, never commit secrets)

| Variable | Purpose |
|----------|---------|
| `GATEWAY_API_TOKEN` | Bearer auth for CRM → gateway |
| `CRM_WEBHOOK_SECRET` | HMAC secret for gateway → CRM webhooks |
| `SIP_ADAPTER_API_TOKEN` | Bearer auth for gateway → sip-adapter |
| `CANARY_ALLOWED_E164` | Whitelist for first live pilots |
| `SIP_PUBLIC_IP` | Public IP advertised in SIP/RTP |
| `VOICE_GATEWAY_VERSION` | Optional image tag for local `gateway-service` / `sip-adapter` builds |
| `OPENAI_API_KEY` | OpenAI Realtime API |

See also [`.env.base.example`](../.env.base.example).

## Firewall (VPS)

- UDP `5060` — SIP (FreeSWITCH, host network)
- UDP `30000-30999` — gateway RTP (`RTP_PORT_START` / `RTP_PORT_END`)
- UDP RTP range used by FreeSWITCH if separate from gateway

## Rollout with CRM releases

Voice gateway images are **built locally** from `apps/gateway-service` and `apps/sip-adapter-service` — they are **not** in the standard GHCR module CSV. After each CRM release that touches voice-gateway code, **rebuild and redeploy** the voice stack on the host (CP updater `pull` alone is not enough).

```bash
cd /opt/crm   # bundle root

docker compose -f compose.base.yml -f compose.client.yml \
  -f compose.modules.outbound.yml -f compose.modules.outbound-sidecar.yml \
  -f compose.modules.voice-gateway.yml --env-file .env \
  build gateway-service sip-adapter && \
docker compose -f compose.base.yml -f compose.client.yml \
  -f compose.modules.outbound.yml -f compose.modules.outbound-sidecar.yml \
  -f compose.modules.voice-gateway.yml --env-file .env \
  up -d gateway-service sip-adapter freeswitch
```

Optional: pin build tag with `VOICE_GATEWAY_VERSION=<crm-version>` in `.env`.

`compose.modules.voice-gateway.yml` is **not** added to CP `composeFiles` by default (no registry images). Operators run the commands above after CRM rollout when voice-gateway sources changed.

## First canary call

1. Set `CANARY_ALLOWED_E164` to your test mobile.
2. Follow [`apps/gateway-service/docs/CANARY_FIRST_CALL.md`](../apps/gateway-service/docs/CANARY_FIRST_CALL.md).
3. Complete FreeSWITCH media spike first: [`apps/sip-adapter-service/freeswitch/MEDIA_SPIKE.md`](../apps/sip-adapter-service/freeswitch/MEDIA_SPIKE.md).
4. Trigger canary from **CRM** (outbound campaign + attempt), not only `curl` against gateway — verify CRM webhooks and attempt terminal state.

## Local dev without PSTN

```bash
# sip-adapter mock
cd apps/sip-adapter-service && FREESWITCH_MODE=mock npm run dev

# gateway
cd apps/gateway-service && KYIVSTAR_API_BASE_URL=http://127.0.0.1:8080 npm run dev
```
