# gateway-service

Outbound AI call gateway for CRM: accepts `POST /v1/outbound/calls`, runs either **mock** lifecycle or **real-mode integration path** (`kyivstar_openai` + rollout gate), and POSTs `attempt.*` webhooks back to the CRM. **CRM code is not part of this package** — configure the CRM integration to point at this service.

## Purpose

- Hold **gateway session** state (`externalSessionId` is canonical).
- Emit **CRM-compatible** realtime webhook payloads (see `crm-webhooks/crm-webhook-mapper.ts`).
- Provide integration points for Kyivstar call-control and OpenAI Realtime WS with explicit rollout gates.

## What works now

- Bearer auth (`GATEWAY_API_TOKEN` = CRM `apiToken`).
- Create-call response includes **`session_id`** (same as `externalSessionId`) for CRM `responseSessionIdKeys`.
- Mock lifecycle: `attempt.started` → `ringing` → `answered` (or early `failed` for `no_answer`) → `transcript.final` → `classification.ready` → optional `catalog.sent` / **`transfer.requested` (callback intent)** → `summary.ready` → `completed`.
- Webhook delivery with retries, **delivery log** (in-memory).
- Debug: `GET /v1/sessions/:id`, `GET /v1/sessions/:id/events`, `GET /v1/mock/scenarios` (Bearer).
- `GET /health` — no auth.
- Real-mode orchestration path exists (`runRealLifecycle`) with provider selection, call-state mapping, and media-bridge integration points.

## What is still integration-point / partial

- **RTP packet plumbing and codec conversion** in media bridge remains environment-specific.
- Kyivstar provider currently uses synthetic state emission unless real trunk credentials/integration endpoint are wired.
- OpenAI provider uses WS contract and requires live key/model; audio semantics depend on deployed transport and session policy.

## Environment (overview)

Copy `.env.example` to `.env`. Required for normal run:

| Variable | Role |
|----------|------|
| `GATEWAY_API_TOKEN` | Bearer secret (same as CRM IntegrationSetting `apiToken`) |
| `CRM_WEBHOOK_SECRET` | Value for `x-outbound-voice-secret` (same as CRM webhook secret) |
| `LOG_LEVEL` | `error` \| `warn` \| `log` \| `info` \| `debug` \| `verbose` — wired to Nest logger |
| `GATEWAY_PROVIDER_MODE` | `mock` (default) or `kyivstar_openai` |
| `REAL_MODE_ENABLED` / `REAL_MODE_PERCENT` | gradual rollout gate for real path |
| Webhook retry vars | `CRM_WEBHOOK_*` — see `.env.example` |

## Mock outcome

Set `crmContext.mockOutcome` (or `context.mockOutcome`) on create-call:

`default` | `no_answer` | `price_issue` | `competitor` | `catalog_requested` | **`callback_requested`** | `do_not_call` | `transferred`

- **`callback_requested`**: sends **`attempt.transfer.requested`** with `payload.intent: "callback_request"` and `fields.callbackIntent` so CRM can run **`assignManagerCallbackTask`** (same event type as a warm “transfer requested”, distinguished by payload/fields).

## Create-call example

`POST /v1/outbound/calls`

```http
Authorization: Bearer <same as CRM apiToken>
Content-Type: application/json
```

```json
{
  "attemptId": "uuid-attempt",
  "campaignId": "camp-1",
  "scenarioCode": "LEAD_QUALIFICATION",
  "scenarioVersion": "1",
  "scenarioKey": "LEAD_QUALIFICATION@1",
  "phone": "+380501112233",
  "phoneNormalized": "380501112233",
  "context": {},
  "crmContext": { "mockOutcome": "default" },
  "callback": {
    "webhookUrl": "https://your-crm.example/integrations/outbound-voice/webhook",
    "webhookSecretHeader": "x-outbound-voice-secret"
  }
}
```

**Response (excerpt):**

```json
{
  "accepted": true,
  "provider": "mock",
  "externalSessionId": "<uuid>",
  "providerSessionId": null,
  "status": "queued",
  "session_id": "<same as externalSessionId>"
}
```

## Webhook event example (CRM receives)

`externalSessionId` must appear under **`correlationIds.externalSessionId`**. `occurredAt` is inside **`payload`** (CRM `ValidationPipe` whitelist).

```json
{
  "eventType": "attempt.classification.ready",
  "deliveryId": "<uuid>",
  "attemptId": "uuid-attempt",
  "providerSessionId": null,
  "correlationIds": {
    "externalSessionId": "<gateway session uuid>",
    "providerCallId": "mock-tel-…",
    "openaiCallId": "mock-ai-…",
    "recordingId": null,
    "transcriptId": null
  },
  "payload": {
    "occurredAt": "2025-03-25T12:00:00.000Z",
    "outcomeKey": "CONTACTED",
    "fields": { "intent": "reactivation" }
  },
  "outcomeKey": "CONTACTED",
  "fields": { "intent": "reactivation" }
}
```

### Callback-request example (`mockOutcome: "callback_requested"`)

After `classification.ready`, gateway sends:

```json
{
  "eventType": "attempt.transfer.requested",
  "deliveryId": "<uuid>",
  "attemptId": "uuid-attempt",
  "providerSessionId": null,
  "correlationIds": {
    "externalSessionId": "<uuid>",
    "providerCallId": "…",
    "openaiCallId": "…",
    "recordingId": null,
    "transcriptId": null
  },
  "payload": {
    "occurredAt": "2025-03-25T12:00:00.000Z",
    "intent": "callback_request",
    "source": "gateway_mock",
    "preferredWindow": "tomorrow_pm",
    "channel": "phone",
    "notes": "Customer requested a manager callback; schedule follow-up per preferred window.",
    "classificationOutcomeKey": "CALLBACK_REQUESTED"
  },
  "fields": {
    "callbackIntent": true,
    "preferredWindow": "tomorrow_pm",
    "requestedAt": "2025-03-25T12:00:00.000Z"
  }
}
```

## Run locally

```bash
cd apps/gateway-service
cp .env.example .env
# fill GATEWAY_API_TOKEN, CRM_WEBHOOK_SECRET
npm run dev
```

From repo root: `npm run dev:gateway`

## Tests

```bash
npm test
```

## CRM integration (`runtimeMode = kyivstar_openai_gateway`)

In CRM settings: `apiBaseUrl` = gateway base URL, path `/v1/outbound/calls`, same token as `GATEWAY_API_TOKEN`, webhook secret aligned with `CRM_WEBHOOK_SECRET`. No CRM code changes required.
