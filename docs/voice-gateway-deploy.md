# Voice gateway deploy (gateway + sip-adapter + FreeSWITCH)

## Stack

| Service | Role |
|---------|------|
| `gateway-service` | CRM outbound AI orchestration, OpenAI Realtime, RTP bridge |
| `sip-adapter` | HTTP B2B API for gateway, ESL to FreeSWITCH |
| `freeswitch` | SIP trunk to provider, RTP B2BUA |

Compose overlay: [`compose.modules.voice-gateway.yml`](../compose.modules.voice-gateway.yml).

## CRM settings

- Outbound voice: `runtimeMode = kyivstar_openai_gateway`
- `apiBaseUrl` = public URL of **gateway** (port 3100 behind reverse proxy)
- `apiToken` = `GATEWAY_API_TOKEN`
- Webhook secret = `CRM_WEBHOOK_SECRET`
- Backend: `CRON_ENABLED=true`

## Firewall (VPS)

- UDP `5060` — SIP (FreeSWITCH, often host network)
- UDP `30000-30999` — gateway RTP (`RTP_PORT_START` / `RTP_PORT_END`)
- UDP RTP range used by FreeSWITCH if separate from gateway

## First canary call

1. Set `CANARY_ALLOWED_E164` to your test mobile.
2. Follow [`apps/gateway-service/docs/CANARY_FIRST_CALL.md`](../apps/gateway-service/docs/CANARY_FIRST_CALL.md).
3. Complete FreeSWITCH media spike first: [`apps/sip-adapter-service/freeswitch/MEDIA_SPIKE.md`](../apps/sip-adapter-service/freeswitch/MEDIA_SPIKE.md).

## Local dev without PSTN

```bash
# sip-adapter mock
cd apps/sip-adapter-service && FREESWITCH_MODE=mock npm run dev

# gateway
cd apps/gateway-service && KYIVSTAR_API_BASE_URL=http://127.0.0.1:8080 npm run dev
```
