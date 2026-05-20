# FreeSWITCH media spike (Phase B0)

Prove bidirectional PCMA RTP to an external UDP peer **before** full gateway E2E.

## Prerequisites

- FreeSWITCH running with ESL on `8021`
- Public IP `SIP_PUBLIC_IP` set in sofia profile (`external_rtp_ip`, `external_sip_ip`)
- Firewall allows UDP RTP test port

## Spike A — socket leg echo

1. Start a UDP listener on a test host (or use `nc -u -l` on VPS).
2. From ESL:

```text
bgapi originate {absolute_codec_string=PCMA,rtp_ptime=20}socket/<TEST_HOST>:<TEST_PORT> async full &park()
```

3. `tcpdump -ni any udp port <TEST_PORT>` — expect RTP payloads (PT=8 PCMA).

## Spike B — bridge provider call to socket leg

1. Answer a test outbound call to provider (or loopback).
2. On `CHANNEL_ANSWER`, note `uuid` of A-leg.
3. Originate B-leg:

```text
bgapi originate {origination_uuid=<bridge-uuid>,absolute_codec_string=PCMA}socket/<GW_HOST>:<GW_PORT> async full &park()
bgapi uuid_bridge <A-uuid> <bridge-uuid>
```

4. Confirm two-way audio path in `tcpdump` on gateway port.

## Production command (sip-adapter)

`sip-adapter` uses the same pattern in `FreeswitchService.attachMedia()`:

- originate `socket/<host>:<port>` leg
- `uuid_bridge` main call UUID with socket leg UUID

Document the exact FS version and any profile flags (`inbound-late-negotiation`, `proxy_media`) that were required in the spike README after staging validation.
