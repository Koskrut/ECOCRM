# First live canary — operator execution checklist

**Scope:** One **whitelisted** E.164 destination, one controlled call. Not broad rollout.

**External contract:** The **telephony B2B** base URL, paths, and JSON shapes are **not** defined by this repository alone. Complete `docs/KYIVSTAR_CONTRACT_MATRIX.md` from **vendor documentation or captured HTTP** before treating any path as confirmed.

---

## A. Contract confirmation (prerequisite)

1. [ ] Open `docs/KYIVSTAR_CONTRACT_MATRIX.md`.
2. [ ] Fill the **“Confirmed (adapter / ops)”** column from real vendor docs, OpenAPI, or staging traces (redact secrets).
3. [ ] If any row stays only in **“Unknown”**, do **not** claim canary-ready for that item — adjust env after discovery.

**In-repo defaults** (`KYIVSTAR_HTTP_*`) are **placeholders** until the matrix says otherwise.

---

## B. Required environment values (gateway process)

Copy from your secrets store; do not commit real tokens.

| Variable | Required for canary | Notes |
|----------|---------------------|--------|
| `GATEWAY_PROVIDER_MODE` | `kyivstar_openai` | |
| `GATEWAY_API_TOKEN` | Yes | Must match CRM IntegrationSetting `apiToken` for gateway create-call. |
| `CRM_WEBHOOK_SECRET` | Yes | Must match CRM outbound webhook secret (header value CRM sends / gateway uses). |
| `REAL_MODE_ENABLED` | `true` | Real telephony + AI + media path. |
| `REAL_MODE_PERCENT` | `100` | Avoids hash skipping the only pilot attempt. |
| `OPENAI_API_KEY` | Yes | Realtime session. |
| `KYIVSTAR_API_BASE_URL` | Yes | **Telephony** control plane (from matrix). |
| `KYIVSTAR_API_TOKEN` | Yes | |
| `KYIVSTAR_HTTP_OUTBOUND_PATH` | Yes | From matrix (may equal default). |
| `KYIVSTAR_HTTP_STATUS_PATH_TEMPLATE` | Yes | Must contain `{callId}` once. |
| `KYIVSTAR_HTTP_HANGUP_PATH_TEMPLATE` | Yes | |
| `KYIVSTAR_HTTP_HANGUP_METHOD` | Yes | `POST` or `DELETE` per vendor. |
| `KYIVSTAR_HTTP_AUTH_STYLE` / `KYIVSTAR_HTTP_AUTH_HEADER_NAME` | If not Bearer | |
| `CANARY_LIVE_CALLS_ENABLED` | `true` | Enforces whitelist. |
| `CANARY_ALLOWED_E164` | Yes | See whitelist format below. |
| `CALL_MAX_DURATION_SEC` | Review | Hard cap for runtime loop. |
| `KYIVSTAR_HTTP_TIMEOUT_MS` | Review | Control-plane HTTP timeout. |

Optional: SIP passthrough envs if your adapter expects them in outbound JSON body.

---

## C. Required flags (behavior)

| Flag / setting | Value for first canary |
|----------------|-------------------------|
| Canary whitelist | `CANARY_LIVE_CALLS_ENABLED=true` |
| Real mode | `REAL_MODE_ENABLED=true` |
| Provider mode | `GATEWAY_PROVIDER_MODE=kyivstar_openai` |
| Control plane | `KYIVSTAR_CONTROL_PLANE_MODE=http` (never `synthetic` for live) |

---

## D. Whitelist format

- Env: `CANARY_ALLOWED_E164=+380501112233` (example only — **use your test handset**).
- Comma-separated; matching is **digits-only** (spaces, `+`, dashes ignored).
- Example: `+380 50 111 2233` and `380501112233` match the same entry `380501112233`.
- If canary is on and the list is **empty**, real calls are **blocked** (`CANARY_BLOCKED` / `canary_whitelist_empty`).
- If the destination is **not** in the list, gateway runs **`runCanaryBlocked`** — **no PSTN dial**.

---

## E. Exact test number

**Record before dial (operator fill-in):**

- Whitelisted E.164: `________________`
- CRM lead/campaign used: `________________`

---

## F. Exact action to launch the call

1. [ ] CRM IntegrationSetting (outbound voice): `runtimeMode=kyivstar_openai_gateway`, `apiBaseUrl` = **gateway** public base URL, `gatewayCreateCallPath` = path your gateway exposes for create-call (often `/v1/outbound/calls`), `apiToken` = same as `GATEWAY_API_TOKEN`.
2. [ ] Gateway deployed with Section B env; health OK.
3. [ ] CRM can `POST` to gateway; gateway can reach `KYIVSTAR_API_BASE_URL` and OpenAI.
4. [ ] Trigger **one** outbound attempt to the **whitelisted** number only (CRM UI or approved API).

There is no separate shell “dial command” in-repo — the call is created through the **CRM → gateway** create-session flow you already use.

---

## G. Live logs to watch (gateway)

| Log / event | Meaning |
|-------------|---------|
| `kyivstar_outbound_create_request` | Outbound POST issued. |
| `kyivstar_outbound_leg_created` | `providerCallId` parsed — **pass** for create. |
| `kyivstar_outbound_create_missing_call_id` | **Stop** — fix extraction / response shape (see `shapeSummary` in log). |
| `telephony_event` (debug) | State transitions from provider. |
| `kyivstar_status_*` | Polling health; repeated failures → eventual `failed` with `provider_status_unavailable`. |
| `media_bridge_connected` | RTP path attempted. |
| `attempt.ai.connected` | AI leg (via CRM webhooks). |
| `telephony_hangup_failed` | Hangup cleanup issue — note for postmortem. |
| `canary_blocked_no_dial` | Number not whitelisted — **no** dial. |
| `CRM webhook delivered` | CRM accepted payload for that `deliveryId`. |

---

## H. Expected provider state flow (typical)

**Not guaranteed** — depends on vendor. Generally: dialing → ringing (optional if skipped) → answered → … → completed/failed.

If your API jumps **answered** without **ringing**, gateway already skips the ringing CRM event (`skippedRinging` path in lifecycle).

---

## I. Expected CRM artifacts (webhook)

Verify in CRM/backend logs or DB (`OutboundVoiceWebhookService`):

| Artifact | Expected |
|----------|----------|
| `attempt.started` | Early |
| `attempt.ringing` | If ringing phase observed |
| `attempt.answered` | After telephony answered |
| `attempt.ai.connected` or equivalent | AI leg |
| `attempt.transcript.final` | If produced; may be absent → **degraded** |
| `attempt.summary.ready` | If produced; may be absent → **degraded** |
| `attempt.classification.ready` | If produced; may be absent → **degraded** |
| **Terminal once** | `attempt.completed` **or** `attempt.failed` — exactly **one** terminal outcome per session |
| `deliveryId` | Same event should not double-apply (CRM returns duplicate handling) |

Payload may show `artifacts.degraded: true` and `artifacts.missing: [...]` — that is **honest** incomplete runtime, not fake data.

---

## J. Pass / fail criteria (one canary)

### Pass (all must be true)

- [ ] Outbound create returns a **real** `providerCallId` (log: `kyivstar_outbound_leg_created`).
- [ ] Ringing/answered semantics **either** observed in logs/events **or** documented skip (e.g. fast answer) is consistent with provider.
- [ ] AI session becomes active (media + AI logs / CRM `attempt.ai.*`).
- [ ] Exactly **one** terminal: `attempt.completed` or `attempt.failed`.
- [ ] Transcript: present **or** explicitly **degraded** in terminal payload (not fabricated).
- [ ] Summary/classification: present **or** explicitly **degraded**.
- [ ] CRM terminal writeback received **once** (no missing terminal for that attempt).

### Fail (any one triggers failure review)

- [ ] `kyivstar_outbound_create_missing_call_id` or repeated 4xx/5xx on create — **contract mismatch** or auth.
- [ ] Auth/path errors on status or hangup after successful create.
- [ ] No terminal CRM event for the attempt.
- [ ] Media bridge error / reconnect exhausted without acceptable reason.
- [ ] **Duplicate** terminal completion for the same logical attempt (investigate `deliveryId` handling).

---

## K. Rollback — trigger conditions

Execute rollback if:

- Create or status returns **401/403** after verifying token.
- **Missing call id** in create response after matrix alignment.
- **No** terminal webhook within expected time after call end.
- **Canary** fired incorrectly (wrong whitelist) — fix env before retry.

---

## L. Rollback — actions

1. Set `REAL_MODE_ENABLED=false` **or** `GATEWAY_PROVIDER_MODE=mock` on gateway.
2. Optionally `CANARY_LIVE_CALLS_ENABLED=false` to disable whitelist enforcement.
3. Preserve logs with `externalSessionId` / `attemptId`.
4. Do not retry live until matrix + env corrected.

---

## M. Readiness (operator)

| State | Meaning |
|-------|--------|
| Matrix filled from vendor | Telephony contract row items have ops confirmation. |
| Env matches matrix | All `KYIVSTAR_HTTP_*` and auth match vendor. |
| Whitelist contains only test handset | |
| CRM integration points at this gateway | |

**If the matrix “adapter / ops” column is still empty, the runbook cannot certify adapter compatibility — only gateway behavior is ready.**
