# SIP adapter HTTP contract (gateway-compatible)

Base URL: `KYIVSTAR_API_BASE_URL` on gateway points here (e.g. `http://sip-adapter:8080`).

Auth: `Authorization: Bearer <SIP_ADAPTER_API_TOKEN>` (same value as gateway `KYIVSTAR_API_TOKEN`).

## POST /v1/outbound/calls

**Request**

```json
{
  "destination": "+380501112233",
  "externalSessionId": "uuid",
  "attemptId": "uuid",
  "correlation": { "externalSessionId": "uuid", "attemptId": "uuid" },
  "sip": { "realm": "", "user": "", "password": "", "proxy": "" }
}
```

**Response** `201`

```json
{
  "callId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "dialing"
}
```

## GET /v1/calls/{callId}/status

**Response** `200`

```json
{
  "status": "dialing",
  "phase": "dialing"
}
```

States: `dialing` | `ringing` | `answered` | `completed` | `failed`.

## POST /v1/calls/{callId}/hangup

**Response** `200`

```json
{ "ok": true, "status": "completed" }
```

## POST /v1/calls/{callId}/media

Called by gateway after answer, once local RTP is bound.

**Request**

```json
{
  "host": "159.195.31.153",
  "port": 30042,
  "codec": "alaw"
}
```

**Response** `200`

```json
{
  "ok": true,
  "status": "media_attached",
  "symmetricRtp": true,
  "rtp": {
    "remoteAddress": "159.195.31.153",
    "remotePort": 16384,
    "codec": "alaw"
  }
}
```

When `symmetricRtp` is `true`, gateway may learn outbound RTP destination from the first inbound RTP packet instead of using `rtp.remoteAddress` / `rtp.remotePort`.

## Errors

| HTTP | Body |
|------|------|
| 401 | Missing/invalid Bearer |
| 404 | Unknown `callId` |
| 409 | Media already attached or call not answered |
| 502 | FreeSWITCH ESL / originate failure |
