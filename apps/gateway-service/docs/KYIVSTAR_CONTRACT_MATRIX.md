# Kyivstar / B2B telephony control-plane — contract confirmation matrix

**Purpose:** Record what is proven in this repo vs what must come from **your** deployed adapter vendor documentation or a live discovery call (curl/OpenAPI). **Do not treat defaults as vendor truth until this matrix is filled.**

Legend:

| Column | Meaning |
|--------|--------|
| **Confirmed (code/repo)** | Implemented behavior or default env; see `configuration.ts`, `kyivstar-http.ts`, `kyivstar-status-map.ts`, `kyivstar.provider.ts`. |
| **Confirmed (adapter / ops)** | Fill only after you have **real** docs, staging URL, or a captured HTTP trace. |
| **Unknown** | Must not be assumed for go-live. |

---

## 1. Transport & URLs

| Item | Confirmed (code/repo) | Confirmed (adapter / ops) | Unknown until external proof |
|------|-------------------------|----------------------------|-------------------------------|
| Base URL for telephony HTTP | Env `KYIVSTAR_API_BASE_URL` (no default in production). | *Fill:* `________________` | Production/staging base URL from vendor. |
| Outbound create path | Default `KYIVSTAR_HTTP_OUTBOUND_PATH=/v1/outbound/calls` — **placeholder default**. | *Fill:* `________________` | Whether vendor uses same path. |
| Status path template | Default `KYIVSTAR_HTTP_STATUS_PATH_TEMPLATE=/v1/calls/{callId}/status` — `{callId}` replaced with URL-encoded provider call id. | *Fill:* `________________` | Exact template (some APIs use different resource names). |
| Hangup path template | Default `KYIVSTAR_HTTP_HANGUP_PATH_TEMPLATE=/v1/calls/{callId}/hangup` | *Fill:* `________________` | Method may differ (`DELETE` vs `POST`). |
| Hangup HTTP method | `KYIVSTAR_HTTP_HANGUP_METHOD` = `POST` or `DELETE` | *Fill:* `________________` | |
| Media attach path | `KYIVSTAR_HTTP_MEDIA_PATH_TEMPLATE=/v1/calls/{callId}/media` — POST body `{ host, port, codec }`. | **sip-adapter-service** [`HTTP_CONTRACT.md`](../../sip-adapter-service/docs/HTTP_CONTRACT.md) | Response may include `symmetricRtp` and `rtp.remoteAddress` / `rtp.remotePort`. |

---

## 2. Authentication

| Item | Confirmed (code/repo) | Confirmed (adapter / ops) | Unknown until external proof |
|------|-------------------------|----------------------------|-------------------------------|
| Style | `KYIVSTAR_HTTP_AUTH_STYLE=bearer` (default) or `api_key` | *Fill:* `________________` | |
| Bearer | `Authorization: Bearer <KYIVSTAR_API_TOKEN>` | *Fill:* token scope / rotation | |
| API key | Header name `KYIVSTAR_HTTP_AUTH_HEADER_NAME` (default `X-Api-Key`), value = `KYIVSTAR_API_TOKEN` | *Fill:* actual header name if not X-Api-Key | |

---

## 3. Request payloads (gateway → adapter)

| Call | Confirmed (code/repo) | Confirmed (adapter / ops) | Unknown until external proof |
|------|-------------------------|----------------------------|-------------------------------|
| **POST outbound** | JSON body includes: `destination` (E.164), `externalSessionId`, `attemptId`, `correlation`, optional `sip` when SIP envs set. | *Fill:* required extra fields / different names | Vendor-required fields not in code. |
| **GET status** | No body; path only. | *Fill:* query params if any | |
| **Hangup** | Body only if non-GET; current client sends JSON body for `POST` only when applicable — hangup uses method from env, empty body for DELETE. | *Fill:* body schema if POST with payload | |
| **POST media** | JSON: `host`, `port`, `codec` (`alaw` \| `mulaw`). Gateway uses after RTP bind. | sip-adapter: bridges FS socket leg to gateway UDP | |

---

## 4. Response payloads (adapter → gateway)

| Call | Confirmed (code/repo) | Confirmed (adapter / ops) | Unknown until external proof |
|------|-------------------------|----------------------------|-------------------------------|
| **Create — call id** | Extracted via `extractOutboundCallId` in `kyivstar-http.ts` (top-level and nested `result`, `data`, `payload`, `call`, etc.; string or numeric id fields). | *Fill:* actual JSON sample (redact secrets) | Exact field name for your adapter. |
| **Create — session id** | Optional: `sessionId`, `session_id`, `providerSessionId` on same or nested objects. | *Fill:* | |
| **Status — state** | `extractStatusString` in `kyivstar-status-map.ts` walks known keys (`status`, `state`, `phase`, `callState`, …) and common nests. | *Fill:* sample GET response | |
| **Terminal labels** | Mapped in `mapProviderStatusToTelephony` (dialing, ringing, answered, completed, failed, …). | *Fill:* labels your API returns | Unmapped labels log `kyivstar_status_unmapped` and hold last safe state. |
| **Media attach** | Response: `ok`, `status`, optional `symmetricRtp`, `rtp: { remoteAddress, remotePort, codec }`. | sip-adapter default: `symmetricRtp: true` | |

---

## 5. Status model

| Item | Confirmed (code/repo) | Confirmed (adapter / ops) | Unknown until external proof |
|------|-------------------------|----------------------------|-------------------------------|
| Mechanism | **Polling:** lifecycle calls `getCallStatus` on an interval; provider also emits in-process events when status changes from polls. | *Fill:* | Whether vendor also offers **webhooks** — **not** consumed by this gateway today; would require future integration. |
| Webhook URL | N/A in current gateway for telephony state. | *Fill if any* | |

---

## 6. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Adapter contract reviewed | | | Attach vendor doc or OpenAPI link |
| Staging curl validated | | | |
| Production env values applied | | | |

**This matrix is incomplete until the “adapter / ops” column is filled from real vendor truth — not from guesses.**
