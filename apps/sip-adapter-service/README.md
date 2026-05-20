# sip-adapter-service

HTTP B2B telephony adapter for CRM `gateway-service`. Implements outbound create/status/hangup/media and drives FreeSWITCH via ESL.

## Run locally (mock, no FreeSWITCH)

```bash
cd apps/sip-adapter-service
cp .env.example .env
# FREESWITCH_MODE=mock
npm install
npm run dev
```

## Run with FreeSWITCH

1. Deploy FreeSWITCH with configs under `freeswitch/` (sofia gateway `provider`, ESL on 8021).
2. Set `FREESWITCH_MODE=esl`, trunk env (`SIP_PROVIDER_HOST`, `SIP_PUBLIC_IP`, `SIP_CLI_NUMBER`).
3. Complete media spike: [`freeswitch/MEDIA_SPIKE.md`](freeswitch/MEDIA_SPIKE.md).

## Gateway wiring

```env
KYIVSTAR_API_BASE_URL=http://sip-adapter:8080
KYIVSTAR_API_TOKEN=<same as SIP_ADAPTER_API_TOKEN>
KYIVSTAR_HTTP_MEDIA_PATH_TEMPLATE=/v1/calls/{callId}/media
RTP_ADVERTISE_ADDRESS=159.195.31.153
```

Contract: [`docs/HTTP_CONTRACT.md`](docs/HTTP_CONTRACT.md).

## Docker / compose

See repo root `compose.modules.voice-gateway.yml`.
